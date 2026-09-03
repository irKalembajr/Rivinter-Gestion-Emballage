-- Migration additive pour la base Rivinter existante. Aucune donnée historique supprimée.
-- Sauvegarder et tester sur une copie avant application en production.
begin;
create table if not exists public.riv_operations (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 location_id text not null references public.locations(id), date date not null,
 kind text not null check(kind in ('purchase','return','consignment','depot_loss','factory_breakage')),
 ref text not null check(length(trim(ref))>0), bv_amount numeric(18,2), note text not null default '',
 created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
 cancelled_at timestamptz, cancelled_by uuid, cancel_reason text
);
create unique index if not exists riv_unique_active_ref on public.riv_operations(location_id,kind,lower(trim(ref))) where cancelled_at is null;
create table if not exists public.riv_lines (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.riv_operations(id),
 kind text not null check(kind in ('purchase','return','consignment','bottle_consignment','depot_loss','factory_breakage')),
 bremer_id text not null references public.bremers(id),product_id text references public.products(id),
 quantity integer not null check(quantity>0),bottle_quantity integer not null default 0 check(bottle_quantity>=0),
 unit_price numeric(18,2) not null check(unit_price>=0),amount numeric(18,2) not null check(amount>=0),
 depot_delta integer not null,balance_delta integer not null,bac_delta integer not null default 0
);
create index if not exists riv_lines_operation on public.riv_lines(operation_id);
create index if not exists riv_operations_location_date on public.riv_operations(location_id,date);
alter table public.riv_operations enable row level security;
alter table public.riv_lines enable row level security;
drop policy if exists riv_operations_read on public.riv_operations;
create policy riv_operations_read on public.riv_operations for select to authenticated using(public.can_read_location(location_id));
drop policy if exists riv_lines_read on public.riv_lines;
create policy riv_lines_read on public.riv_lines for select to authenticated using(exists(select 1 from public.riv_operations o where o.id=operation_id and public.can_read_location(o.location_id)));
revoke all on public.riv_operations,public.riv_lines from anon,authenticated;
grant select on public.riv_operations,public.riv_lines to authenticated;

-- Vue historique non destructive. Les anciennes consignations gardent leurs effets
-- d'origine : emballages sans sortie dépôt ; bouteilles avec consommation de bacs.
create or replace view public.riv_ledger with (security_invoker=true) as
select l.id::text id,o.id::text op_id,o.location_id,o.date,l.kind,l.bremer_id,l.product_id,
 l.quantity::numeric quantity,l.bottle_quantity::numeric bottle_quantity,l.amount,
 l.depot_delta::numeric depot_delta,l.balance_delta::numeric balance_delta,l.bac_delta::numeric bac_delta,
 o.ref,o.bv_amount,o.note,false legacy
from public.riv_lines l join public.riv_operations o on o.id=l.operation_id where o.cancelled_at is null
union all
select 'purchase:'||p.id::text,'purchase:'||p.id::text,p.location_id,p.date,'purchase',pr.bremer_id,p.product_id,
 p.quantity,0::numeric,p.quantity*p.unit_price,p.quantity,p.quantity,0::numeric,coalesce(p.order_no,''),null::numeric,coalesce(p.note,''),true
from public.purchases p join public.products pr on pr.id=p.product_id
union all
select 'return:'||r.id::text,'return:'||r.id::text,r.location_id,r.date,
 case when r.movement_type='bottle_consignment' then 'bottle_consignment' when r.movement_type='consignment' then 'consignment' else 'return' end,
 r.bremer_id,null::text,r.quantity,coalesce((to_jsonb(r)->>'bottle_quantity')::numeric,0),
 case when coalesce(r.amount,0)=0 then r.quantity*b.price else r.amount end,
 case when r.movement_type in ('consignment','bottle_consignment') then 0 else -r.quantity end,
 -r.quantity,case when r.movement_type='bottle_consignment' then -r.quantity else 0 end,
 coalesce(r.ref,''),null::numeric,coalesce(r.note,''),true
from public.packaging_returns r join public.bremers b on b.id=r.bremer_id;
grant select on public.riv_ledger to authenticated;

-- Contrôle du stock à la date et à toutes les dates postérieures : un mouvement
-- antidaté ne doit pas rendre négatif un stock déjà consommé ultérieurement.
create or replace function public.riv_check_stock(p_site text,p_type text,p_date date,p_delta numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_start numeric;v_running numeric;v_day record;
begin
 if p_delta>=0 then return;end if;
 select coalesce(sum(quantity),0) into v_start from public.initial_stocks where scope='depot' and location_id=p_site and bremer_id=p_type;
 select v_start+coalesce(sum(case when bremer_id=p_type then depot_delta else 0 end+case when p_type='BAC' then bac_delta else 0 end),0)
 into v_running from public.riv_ledger where location_id=p_site and date<=p_date;
 if v_running+p_delta<0 then raise exception 'Stock dépôt insuffisant pour % : % disponible(s), % requis.',p_type,v_running,-p_delta;end if;
 for v_day in select date,sum(case when bremer_id=p_type then depot_delta else 0 end+case when p_type='BAC' then bac_delta else 0 end) delta
 from public.riv_ledger where location_id=p_site and date>p_date group by date order by date loop
 v_running:=v_running+v_day.delta;
 if v_running+p_delta<0 then raise exception 'Le mouvement rendrait le stock % négatif au %.',p_type,v_day.date;end if;
 end loop;
end $$;
revoke all on function public.riv_check_stock(text,text,date,numeric) from public,anon,authenticated;

create or replace function public.riv_post_operation(p jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_request uuid;v_site text;v_kind text;v_date date;v_ref text;v_bv numeric;
 l jsonb;v_line_kind text;v_type text;v_product text;v_count numeric;v_q integer;v_bottles integer;
 v_price numeric;v_amount numeric;v_total numeric:=0;v_depot integer;v_balance integer;v_bac integer;
 v_pack integer;v_bottle_price integer;v_lines jsonb:='[]'::jsonb;r record;
begin
 if not public.is_app_admin() then raise exception 'Réservé à un administrateur actif.';end if;
 perform pg_advisory_xact_lock(20260903,1);
 v_request:=(p->>'request_id')::uuid;
 select id into v_id from public.riv_operations where request_id=v_request;
 if v_id is not null then return v_id;end if;
 v_site:=p->>'location_id';v_kind:=p->>'kind';v_date:=(p->>'date')::date;v_ref:=trim(p->>'ref');
 if v_request is null or v_site is null or not exists(select 1 from public.locations where id=v_site) then raise exception 'Site ou identifiant de requête invalide.';end if;
 if v_date is null or v_date>current_date then raise exception 'Date invalide ou future.';end if;
 if v_kind is null or v_kind not in ('purchase','return','consignment','depot_loss','factory_breakage') or coalesce(v_ref,'')='' then raise exception 'Type et référence obligatoires.';end if;
 if jsonb_typeof(p->'lines') is distinct from 'array' then raise exception 'Lignes manquantes.';end if;
 if jsonb_array_length(p->'lines')<1 or jsonb_array_length(p->'lines')>100 then raise exception 'Entre 1 et 100 lignes requises.';end if;
 if v_kind in ('depot_loss','factory_breakage') and length(trim(coalesce(p->>'note','')))<3 then raise exception 'Motif obligatoire.';end if;
 for l in select value from jsonb_array_elements(p->'lines') loop
  v_line_kind:=case when v_kind='consignment' then coalesce(l->>'kind','consignment') else v_kind end;
  if v_kind='consignment' and v_line_kind not in ('consignment','bottle_consignment') then raise exception 'Ligne de consignation invalide.';end if;
  v_count:=(l->>'quantity')::numeric;
  if v_count is null or v_count<=0 or v_count<>trunc(v_count) or v_count>10000000 then raise exception 'Quantité entière positive requise.';end if;
  v_type:=l->>'bremer_id';v_product:=null;v_bottles:=0;v_price:=null;
  if v_kind='purchase' then
   v_product:=l->>'product_id';
   select pr.bremer_id,coalesce(pp.price,pr.price) into v_type,v_price from public.products pr left join public.product_prices pp on pp.product_id=pr.id and pp.location_id=v_site where pr.id=v_product;
   if v_type is null then raise exception 'Produit inconnu.';end if;
  end if;
  if v_type is null or v_type not in ('B65','B33N','B33V','B30CL','ALE50','BAC') then raise exception 'Bremer inconnu.';end if;
  v_q:=v_count::integer;
  if v_line_kind='bottle_consignment' then
   if v_type='BAC' then raise exception 'Un bac n’est pas une bouteille.';end if;
   v_pack:=case v_type when 'B65' then 12 when 'ALE50' then 20 else 24 end;
   v_bottle_price:=case when v_type in ('B65','ALE50') then 1000 else 500 end;
   if v_q%v_pack<>0 then raise exception 'Le nombre de bouteilles doit être multiple de %.',v_pack;end if;
   v_bottles:=v_q;v_q:=v_q/v_pack;v_price:=v_pack*v_bottle_price;
  elsif v_kind<>'purchase' then
   v_price:=case v_type when 'BAC' then 4500 when 'ALE50' then 24500 else 16500 end;
  end if;
  if v_price is null or v_price<0 then raise exception 'Prix produit invalide.';end if;
  v_depot:=case when v_line_kind='purchase' then v_q when v_line_kind in ('return','consignment','depot_loss') then -v_q else 0 end;
  v_balance:=case when v_line_kind in ('purchase','factory_breakage') then v_q when v_line_kind in ('return','consignment','bottle_consignment') then -v_q else 0 end;
  v_bac:=case when v_line_kind='bottle_consignment' then -v_q else 0 end;
  v_amount:=v_q*v_price;v_total:=v_total+v_amount;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('kind',v_line_kind,'bremer_id',v_type,'product_id',v_product,'quantity',v_q,'bottle_quantity',v_bottles,'unit_price',v_price,'amount',v_amount,'depot_delta',v_depot,'balance_delta',v_balance,'bac_delta',v_bac));
 end loop;
 if v_kind='consignment' then
  v_bv:=(p->>'bv_amount')::numeric;
  if v_bv is null or v_bv<=0 or v_bv<>v_total then raise exception 'Montant BV différent du total calculé : % Fc.',v_total;end if;
 end if;
 -- Additionner toutes les sorties d'un même type, y compris bacs et bouteilles.
 for r in select typ,sum(delta) delta from (
  select value->>'bremer_id' typ,(value->>'depot_delta')::numeric delta from jsonb_array_elements(v_lines)
  union all select 'BAC',(value->>'bac_delta')::numeric from jsonb_array_elements(v_lines)) a group by typ loop
  perform public.riv_check_stock(v_site,r.typ,v_date,r.delta);
 end loop;
 insert into public.riv_operations(request_id,location_id,date,kind,ref,bv_amount,note) values(v_request,v_site,v_date,v_kind,v_ref,v_bv,coalesce(p->>'note','')) returning id into v_id;
 insert into public.riv_lines(operation_id,kind,bremer_id,product_id,quantity,bottle_quantity,unit_price,amount,depot_delta,balance_delta,bac_delta)
 select v_id,x.kind,x.bremer_id,x.product_id,x.quantity,x.bottle_quantity,x.unit_price,x.amount,x.depot_delta,x.balance_delta,x.bac_delta
 from jsonb_to_recordset(v_lines) x(kind text,bremer_id text,product_id text,quantity integer,bottle_quantity integer,unit_price numeric,amount numeric,depot_delta integer,balance_delta integer,bac_delta integer);
 return v_id;
end $$;
revoke all on function public.riv_post_operation(jsonb) from public,anon;
grant execute on function public.riv_post_operation(jsonb) to authenticated;

create or replace function public.riv_cancel_operation(p_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare o public.riv_operations;r record;
begin
 if not public.is_app_admin() then raise exception 'Réservé à un administrateur actif.';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motif d’annulation obligatoire.';end if;
 perform pg_advisory_xact_lock(20260903,1);
 select * into o from public.riv_operations where id=p_id for update;
 if o.id is null then raise exception 'Opération introuvable.';end if;
 if o.cancelled_at is not null then return;end if;
 for r in select typ,-sum(delta) delta from (
  select bremer_id typ,depot_delta delta from public.riv_lines where operation_id=p_id
  union all select 'BAC',bac_delta from public.riv_lines where operation_id=p_id) a group by typ loop
  perform public.riv_check_stock(o.location_id,r.typ,o.date,r.delta);
 end loop;
 update public.riv_operations set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_reason) where id=p_id;
end $$;
revoke all on function public.riv_cancel_operation(uuid,text) from public,anon;
grant execute on function public.riv_cancel_operation(uuid,text) to authenticated;

create or replace function public.riv_save_opening(p_site text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r jsonb;v_type text;v_depot numeric;v_signed numeric;v_old numeric;v_price numeric;
begin
 if not public.can_edit_initial_stock() then raise exception 'Stock initial verrouillé ou accès refusé.';end if;
 perform pg_advisory_xact_lock(20260903,1);
 if not exists(select 1 from public.locations where id=p_site) then raise exception 'Site inconnu.';end if;
 if exists(select 1 from public.riv_ledger where location_id=p_site) then raise exception 'Le site possède des mouvements. Conserver le report historique ; utiliser une correction documentée.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Reports invalides.';end if;
 if jsonb_array_length(p_rows)<>6 or (select count(distinct value->>'bremer_id') from jsonb_array_elements(p_rows))<>6 then raise exception 'Les six familles sont requises une seule fois.';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  v_type:=r->>'bremer_id';v_depot:=(r->>'depot')::numeric;v_signed:=(r->>'balance')::numeric;
  if v_type is null or v_type not in ('B65','B33N','B33V','B30CL','ALE50','BAC') or v_depot is null or v_signed is null or v_depot<0 or v_depot<>trunc(v_depot) or v_signed<>trunc(v_signed) then raise exception 'Report invalide.';end if;
  v_price:=case v_type when 'BAC' then 4500 when 'ALE50' then 24500 else 16500 end;
  select coalesce(sum(quantity),0) into v_old from public.initial_stocks where location_id=p_site and bremer_id=v_type and scope='factory';
  insert into public.initial_stocks(scope,location_id,bremer_id,quantity,value) values('depot',p_site,v_type,v_depot,v_depot*v_price),('factory',p_site,v_type,-v_signed,-v_signed*v_price)
  on conflict(scope,location_id,bremer_id) do update set quantity=excluded.quantity,value=excluded.value;
  -- Préserver le report global non affecté lors de l'ajout d'un report de site.
  insert into public.global_factory_initial(bremer_id,quantity,value) values(v_type,-v_signed-v_old,(-v_signed-v_old)*v_price)
  on conflict(bremer_id) do update set quantity=global_factory_initial.quantity-v_signed-v_old,value=(global_factory_initial.quantity-v_signed-v_old)*v_price;
 end loop;
end $$;
revoke all on function public.riv_save_opening(text,jsonb) from public,anon;
grant execute on function public.riv_save_opening(text,jsonb) to authenticated;
commit;
