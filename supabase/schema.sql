create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('principal_admin', 'admin', 'user');
  end if;
  if not exists (select 1 from pg_type where typname = 'stock_scope') then
    create type public.stock_scope as enum ('depot', 'factory');
  end if;
end $$;

create table if not exists public.locations (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('Site', 'Axe')),
  parent_id text references public.locations(id),
  sort_order integer not null default 0
);

create table if not exists public.bremers (
  id text primary key,
  code text not null,
  label text not null,
  excel_label text,
  price numeric not null default 0,
  sort_order integer not null default 0
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  bremer_id text not null references public.bremers(id),
  price numeric not null default 0
);

create table if not exists public.product_prices (
  product_id text not null references public.products(id) on delete cascade,
  location_id text not null references public.locations(id) on delete cascade,
  price numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'user',
  location_id text references public.locations(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.initial_stocks (
  scope public.stock_scope not null,
  location_id text not null references public.locations(id) on delete cascade,
  bremer_id text not null references public.bremers(id) on delete cascade,
  quantity numeric not null default 0,
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, location_id, bremer_id)
);

create table if not exists public.global_factory_initial (
  bremer_id text primary key references public.bremers(id) on delete cascade,
  quantity numeric not null default 0,
  value numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.initial_stocks add column if not exists value numeric not null default 0;
alter table public.global_factory_initial add column if not exists value numeric not null default 0;

create table if not exists public.objectives (
  month text not null,
  location_id text not null references public.locations(id) on delete cascade,
  qty numeric not null default 0,
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, location_id)
);

create table if not exists public.product_objectives (
  month text not null,
  location_id text not null references public.locations(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, location_id, product_id)
);

create table if not exists public.depot_monthly_packaging (
  month text not null,
  location_id text not null references public.locations(id) on delete cascade,
  bremer_id text not null references public.bremers(id) on delete cascade,
  quantity numeric not null default 0,
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, location_id, bremer_id)
);

create table if not exists public.depot_monthly_products (
  month text not null,
  location_id text not null references public.locations(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  quantity numeric not null default 0,
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, location_id, product_id)
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  order_no text,
  location_id text not null references public.locations(id),
  product_id text not null references public.products(id),
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.packaging_returns (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ref text,
  location_id text not null references public.locations(id),
  bremer_id text not null references public.bremers(id),
  quantity numeric not null default 0,
  shipped_qty numeric not null default 0,
  movement_type text not null default 'return' check (movement_type in ('return', 'consignment')),
  bank_deposit_id uuid,
  amount numeric not null default 0,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.packaging_returns add column if not exists movement_type text not null default 'return';
alter table public.packaging_returns add column if not exists bank_deposit_id uuid;
alter table public.packaging_returns add column if not exists amount numeric not null default 0;

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  location_id text not null references public.locations(id),
  cash_initial numeric not null default 0,
  cash_final numeric not null default 0,
  stock_initial_qty numeric not null default 0,
  stock_initial_value numeric not null default 0,
  stock_final_qty numeric not null default 0,
  stock_final_value numeric not null default 0,
  purchases_qty numeric not null default 0,
  purchases_value numeric not null default 0,
  sales_qty numeric not null default 0,
  sales_value numeric not null default 0,
  rebates_qty numeric not null default 0,
  rebates_value numeric not null default 0,
  losses_qty numeric not null default 0,
  losses_value numeric not null default 0,
  free_qty numeric not null default 0,
  free_value numeric not null default 0,
  salary numeric not null default 0,
  expenses numeric not null default 0,
  bank_deposit numeric not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (month, location_id)
);

alter table public.audits drop constraint if exists audits_month_location_id_key;
alter table public.audits drop constraint if exists audits_month_location_id_created_by_key;
alter table public.audits add constraint audits_month_location_id_created_by_key unique (month, location_id, created_by);

create table if not exists public.finance_deposits (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  month text not null,
  location_id text not null references public.locations(id),
  bank_name text not null check (bank_name in ('Rawbank', 'TMB')),
  account_name text not null,
  purpose text not null default 'versement' check (purpose in ('versement', 'achat_direct', 'consignation', 'autre')),
  amount numeric not null default 0,
  bordereau_no text not null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.finance_loans (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  month text not null,
  lender_location_id text not null references public.locations(id),
  borrower_location_id text not null references public.locations(id),
  order_no text,
  reason text not null default 'achat_produit',
  amount numeric not null default 0,
  paid_amount numeric not null default 0,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  month text not null,
  payment_type text not null default 'payer' check (payment_type in ('payer', 'ordre_virement')),
  bank_name text not null check (bank_name in ('Rawbank', 'TMB')),
  account_name text not null,
  amount numeric not null default 0,
  ref text,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.capital_entries (
  month text not null,
  location_id text not null references public.locations(id) on delete cascade,
  product_value numeric not null default 0,
  cash_value numeric not null default 0,
  debt_value numeric not null default 0,
  other_value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, location_id)
);

create table if not exists public.capital_settings (
  month text primary key,
  credit_limit numeric not null default 0,
  current_credit_level numeric not null default 0,
  credit_reduction numeric not null default 0,
  rivinter_debt numeric not null default 0,
  rebates_value numeric not null default 0,
  free_value numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.packaging_returns drop constraint if exists packaging_returns_movement_type_check;
alter table public.packaging_returns add constraint packaging_returns_movement_type_check
check (movement_type in ('return', 'consignment'));
alter table public.packaging_returns drop constraint if exists packaging_returns_bank_deposit_id_fkey;
alter table public.packaging_returns add constraint packaging_returns_bank_deposit_id_fkey
foreign key (bank_deposit_id) references public.finance_deposits(id) on delete set null;

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at before update on public.app_settings
for each row execute function public.touch_updated_at();

drop trigger if exists initial_stocks_touch_updated_at on public.initial_stocks;
create trigger initial_stocks_touch_updated_at before update on public.initial_stocks
for each row execute function public.touch_updated_at();

drop trigger if exists global_factory_touch_updated_at on public.global_factory_initial;
create trigger global_factory_touch_updated_at before update on public.global_factory_initial
for each row execute function public.touch_updated_at();

drop trigger if exists objectives_touch_updated_at on public.objectives;
create trigger objectives_touch_updated_at before update on public.objectives
for each row execute function public.touch_updated_at();

drop trigger if exists product_objectives_touch_updated_at on public.product_objectives;
create trigger product_objectives_touch_updated_at before update on public.product_objectives
for each row execute function public.touch_updated_at();

drop trigger if exists depot_monthly_packaging_touch_updated_at on public.depot_monthly_packaging;
create trigger depot_monthly_packaging_touch_updated_at before update on public.depot_monthly_packaging
for each row execute function public.touch_updated_at();

drop trigger if exists depot_monthly_products_touch_updated_at on public.depot_monthly_products;
create trigger depot_monthly_products_touch_updated_at before update on public.depot_monthly_products
for each row execute function public.touch_updated_at();

drop trigger if exists audits_touch_updated_at on public.audits;
create trigger audits_touch_updated_at before update on public.audits
for each row execute function public.touch_updated_at();

drop trigger if exists product_prices_touch_updated_at on public.product_prices;
create trigger product_prices_touch_updated_at before update on public.product_prices
for each row execute function public.touch_updated_at();

drop trigger if exists finance_loans_touch_updated_at on public.finance_loans;
create trigger finance_loans_touch_updated_at before update on public.finance_loans
for each row execute function public.touch_updated_at();

drop trigger if exists capital_entries_touch_updated_at on public.capital_entries;
create trigger capital_entries_touch_updated_at before update on public.capital_entries
for each row execute function public.touch_updated_at();

drop trigger if exists capital_settings_touch_updated_at on public.capital_settings;
create trigger capital_settings_touch_updated_at before update on public.capital_settings
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'user', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.app_current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true limit 1;
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_current_role() in ('principal_admin', 'admin'), false);
$$;

create or replace function public.is_principal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_current_role() = 'principal_admin', false);
$$;

create or replace function public.initial_stock_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value->>'locked')::boolean from public.app_settings where key = 'initial_stock'), false);
$$;

create or replace function public.can_edit_initial_stock()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin() and not public.initial_stock_locked();
$$;

create or replace function public.can_read_location(p_location_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (p.role in ('principal_admin', 'admin') or p.location_id = p_location_id)
  );
$$;

create or replace function public.prevent_principal_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role = 'principal_admin' and not public.is_principal_admin() then
    raise exception 'Seul l administrateur principal peut créer ou modifier un principal_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_principal_escalation on public.profiles;
create trigger profiles_prevent_principal_escalation
before insert or update on public.profiles
for each row execute function public.prevent_principal_escalation();

insert into public.app_settings (key, value)
values ('initial_stock', jsonb_build_object('locked', false, 'locked_at', null, 'locked_by', null))
on conflict (key) do nothing;

insert into public.locations (id, name, kind, parent_id, sort_order) values
('beni', 'Beni Matongé', 'Site', null, 10),
('pasisi', 'Pasisi', 'Site', null, 20),
('oicha', 'Oicha', 'Site', null, 30),
('kasindi', 'Kasindi', 'Site', null, 40),
('eringeti', 'Eringeti', 'Site', null, 50),
('komanda', 'Komanda', 'Site', null, 60),
('mambasa', 'Mambasa', 'Site', null, 70),
('mabalako1', 'Mabalako1', 'Axe', 'beni', 110),
('mabalako2', 'Mabalako2', 'Axe', 'beni', 120),
('mununze', 'Mununze', 'Axe', 'beni', 130),
('kyanzaba', 'Kyanzaba', 'Axe', 'beni', 140),
('usine', 'Usine', 'Axe', 'beni', 150),
('mungamba', 'Mungamba', 'Axe', 'beni', 160),
('mambingi', 'Mambingi', 'Axe', 'beni', 170),
('mabuku', 'Mabuku', 'Axe', 'beni', 180),
('cantine', 'Cantine', 'Axe', 'beni', 190),
('goma', 'Goma', 'Axe', 'beni', 200)
on conflict (id) do update set name = excluded.name, kind = excluded.kind, parent_id = excluded.parent_id, sort_order = excluded.sort_order;

insert into public.bremers (id, code, label, excel_label, price, sort_order) values
('B65', 'B65', 'Bremers 65Cl', 'Bremer 65 cl', 16500, 10),
('ALE50', 'ALE 50', 'Bremers 50Cl', 'Bremer 50 cl', 24500, 20),
('B33N', 'B33N', 'Bremers 33Cl Noir', 'Bremer 33 Noir', 16500, 30),
('B33V', 'B33V', 'Bremers 33Cl Vert', 'Bremer 33 Vert', 16500, 40),
('B30CL', 'B30Cl', 'Bremers 30Cl Blanche', 'Bambi 30 cl', 16500, 50),
('BAC', 'Bac vide', 'Bac vide', 'Bac vide', 4500, 60)
on conflict (id) do update set code = excluded.code, label = excluded.label, excel_label = excluded.excel_label, price = excluded.price, sort_order = excluded.sort_order;

insert into public.products (id, name, bremer_id, price) values
('simba65', 'Simba 65Cl', 'B65', 43000),
('tembo65', 'Tembo 65Cl', 'B65', 46700),
('export65', '33 Export 65Cl', 'B65', 43000),
('doppel65', 'Doppel 65Cl', 'B65', 43000),
('doppel50', 'Doppel 50Cl', 'ALE50', 48500),
('export50', '33 Export 50Cl', 'ALE50', 48500),
('castel50', 'Castel 50Cl', 'ALE50', 48500),
('peak55', 'Peak 55', 'ALE50', 48500),
('tembo33', 'Tembo 33Cl', 'B33N', 47000),
('castel33', 'Castel 33Cl', 'B33N', 47000),
('peak77', 'Peak 77', 'B33N', 45000),
('booster', 'Booster', 'B33N', 45000),
('beaufort33', 'Beaufort', 'B33V', 63500),
('chill33', 'Chill', 'B33V', 46000),
('djinos', 'Djinos', 'B30CL', 23000),
('xxl', 'XXL', 'B30CL', 30000),
('djino-orange', 'Djino Orange', 'B30CL', 0),
('djino-grenadine', 'Djino Grenadine', 'B30CL', 0),
('djino-soda', 'Djino Soda', 'B30CL', 0),
('djino-tropical', 'Djino Tropical', 'B30CL', 0),
('djino-youzou', 'Djino Youzou', 'B30CL', 0),
('djino-tonic', 'Djino Tonic', 'B30CL', 0)
on conflict (id) do update set name = excluded.name, bremer_id = excluded.bremer_id, price = excluded.price;

insert into public.product_prices (product_id, location_id, price) values
('simba65', 'mambasa', 47000),
('tembo65', 'mambasa', 51000),
('export65', 'mambasa', 47000),
('doppel65', 'mambasa', 47000),
('doppel50', 'mambasa', 53000),
('export50', 'mambasa', 53000),
('castel50', 'mambasa', 59000),
('peak55', 'mambasa', 53000),
('tembo33', 'mambasa', 52000),
('castel33', 'mambasa', 52000),
('peak77', 'mambasa', 50000),
('booster', 'mambasa', 49500),
('beaufort33', 'mambasa', 67000),
('chill33', 'mambasa', 50000),
('djinos', 'mambasa', 25500),
('xxl', 'mambasa', 32500)
on conflict (product_id, location_id) do update set price = excluded.price;

update public.purchases p
set unit_price = coalesce(
  (select pp.price from public.product_prices pp where pp.product_id = pr.id and pp.location_id = p.location_id),
  pr.price
)
from public.products pr
where p.product_id = pr.id
  and pr.id in ('tembo33', 'export50', 'djinos', 'xxl');

create or replace function public.seed_initial_stocks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.global_factory_initial (bremer_id, quantity, value) values
  ('B65', 2592, 0), ('ALE50', 11, 0), ('B33N', 1220, 0), ('B33V', 617, 0), ('B30CL', 771, 0), ('BAC', 0, 0)
  on conflict (bremer_id) do update set quantity = excluded.quantity, value = excluded.value;

  update public.global_factory_initial g
  set value = g.quantity * b.price
  from public.bremers b
  where b.id = g.bremer_id;

  insert into public.initial_stocks (scope, location_id, bremer_id, quantity, value) values
  ('depot', 'mambasa', 'B65', 1248, 0), ('depot', 'mambasa', 'ALE50', 3084, 0), ('depot', 'mambasa', 'B33N', 861, 0), ('depot', 'mambasa', 'B33V', 23, 0), ('depot', 'mambasa', 'B30CL', 909, 0),
  ('depot', 'mungamba', 'B65', 649, 0), ('depot', 'mungamba', 'ALE50', 800, 0), ('depot', 'mungamba', 'B33N', 480, 0), ('depot', 'mungamba', 'B33V', 0, 0), ('depot', 'mungamba', 'B30CL', 105, 0),
  ('depot', 'komanda', 'B65', 902, 0), ('depot', 'komanda', 'ALE50', 600, 0), ('depot', 'komanda', 'B33N', 400, 0), ('depot', 'komanda', 'B33V', 0, 0), ('depot', 'komanda', 'B30CL', 140, 0),
  ('depot', 'pasisi', 'B65', 500, 0), ('depot', 'pasisi', 'ALE50', 2500, 0), ('depot', 'pasisi', 'B33N', 1500, 0), ('depot', 'pasisi', 'B33V', 237, 0), ('depot', 'pasisi', 'B30CL', 500, 0),
  ('depot', 'beni', 'B65', 455, 0), ('depot', 'beni', 'ALE50', 2410, 0), ('depot', 'beni', 'B33N', 1608, 0), ('depot', 'beni', 'B33V', 162, 0), ('depot', 'beni', 'B30CL', 530, 0),
  ('depot', 'kasindi', 'B65', 265, 0), ('depot', 'kasindi', 'ALE50', 2121, 0), ('depot', 'kasindi', 'B33N', 397, 0), ('depot', 'kasindi', 'B33V', 70, 0), ('depot', 'kasindi', 'B30CL', 161, 0),
  ('depot', 'oicha', 'B65', 420, 0), ('depot', 'oicha', 'ALE50', 2405, 0), ('depot', 'oicha', 'B33N', 1033, 0), ('depot', 'oicha', 'B33V', 40, 0), ('depot', 'oicha', 'B30CL', 614, 0),
  ('depot', 'eringeti', 'B65', 24, 0), ('depot', 'eringeti', 'ALE50', 293, 0), ('depot', 'eringeti', 'B33N', 28, 0), ('depot', 'eringeti', 'B33V', 5, 0), ('depot', 'eringeti', 'B30CL', 44, 0)
  on conflict (scope, location_id, bremer_id) do update set quantity = excluded.quantity, value = excluded.value;

  update public.initial_stocks s
  set value = s.quantity * b.price
  from public.bremers b
  where b.id = s.bremer_id and s.scope = 'depot';

  insert into public.initial_stocks (scope, location_id, bremer_id, quantity, value)
  select 'depot'::public.stock_scope, l.id, b.id, 0, 0
  from public.locations l cross join public.bremers b
  where not exists (
    select 1 from public.initial_stocks s
    where s.scope = 'depot' and s.location_id = l.id and s.bremer_id = b.id
  );

  insert into public.initial_stocks (scope, location_id, bremer_id, quantity, value)
  select 'factory'::public.stock_scope, l.id, b.id, 0, 0
  from public.locations l cross join public.bremers b
  on conflict (scope, location_id, bremer_id) do nothing;
end;
$$;

select public.seed_initial_stocks();

insert into public.capital_entries (month, location_id, product_value, cash_value, debt_value, other_value) values
('2026-07', 'beni', 226367000, 13292000, 0, 0),
('2026-07', 'pasisi', 119569800, 23472300, 0, 0),
('2026-07', 'oicha', 116179700, 43953500, 0, 0),
('2026-07', 'eringeti', 4408500, 1039500, 0, 0),
('2026-07', 'komanda', 1130000, 92275500, 0, 0),
('2026-07', 'mambasa', 294034000, 41064500, 0, 0),
('2026-07', 'kasindi', 57050700, 8203000, 0, 0)
on conflict (month, location_id) do nothing;

insert into public.capital_settings (
  month,
  credit_limit,
  current_credit_level,
  credit_reduction,
  rivinter_debt,
  rebates_value,
  free_value
) values (
  '2026-07',
  1365000000,
  1526977818,
  91000000,
  280814500,
  147829345,
  0
)
on conflict (month) do nothing;

create or replace function public.reset_company_data(p_restore_seed boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_principal_admin() then
    raise exception 'Reinitialisation reservee a l administrateur principal';
  end if;

  delete from public.app_events;
  delete from public.audits;
  delete from public.packaging_returns;
  delete from public.purchases;
  delete from public.product_objectives;
  delete from public.objectives;
  delete from public.depot_monthly_products;
  delete from public.depot_monthly_packaging;
  delete from public.finance_payments;
  delete from public.finance_loans;
  delete from public.finance_deposits;
  delete from public.capital_entries;
  delete from public.capital_settings;
  delete from public.initial_stocks;
  delete from public.global_factory_initial;
  delete from public.app_settings;

  insert into public.app_settings (key, value)
  values ('initial_stock', jsonb_build_object('locked', false, 'locked_at', null, 'locked_by', null))
  on conflict (key) do update
  set value = excluded.value, updated_at = now();

  if p_restore_seed then
    perform public.seed_initial_stocks();
  end if;

end;
$$;

create or replace function public.lock_initial_stock()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_principal_admin() then
    raise exception 'Verrouillage réservé à l administrateur principal';
  end if;

  update public.app_settings
  set value = jsonb_build_object('locked', true, 'locked_at', now(), 'locked_by', auth.uid())
  where key = 'initial_stock';

  insert into public.app_events (actor_id, action, details)
  values (auth.uid(), 'lock_initial_stock', '{}'::jsonb);
end;
$$;

alter table public.locations enable row level security;
alter table public.bremers enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.initial_stocks enable row level security;
alter table public.global_factory_initial enable row level security;
alter table public.objectives enable row level security;
alter table public.product_objectives enable row level security;
alter table public.depot_monthly_packaging enable row level security;
alter table public.depot_monthly_products enable row level security;
alter table public.purchases enable row level security;
alter table public.packaging_returns enable row level security;
alter table public.audits enable row level security;
alter table public.finance_deposits enable row level security;
alter table public.finance_loans enable row level security;
alter table public.finance_payments enable row level security;
alter table public.capital_entries enable row level security;
alter table public.capital_settings enable row level security;
alter table public.app_events enable row level security;

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated using (true);
drop policy if exists locations_write_admin on public.locations;
create policy locations_write_admin on public.locations for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists bremers_select on public.bremers;
create policy bremers_select on public.bremers for select to authenticated using (true);
drop policy if exists bremers_write_admin on public.bremers;
create policy bremers_write_admin on public.bremers for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using (true);
drop policy if exists products_write_admin on public.products;
create policy products_write_admin on public.products for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists product_prices_select on public.product_prices;
create policy product_prices_select on public.product_prices for select to authenticated using (true);
drop policy if exists product_prices_write_admin on public.product_prices;
create policy product_prices_write_admin on public.product_prices for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.is_app_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (public.is_principal_admin() or (public.app_current_role() = 'admin' and role <> 'principal_admin'))
with check (public.is_principal_admin() or (public.app_current_role() = 'admin' and role <> 'principal_admin'));

drop policy if exists app_settings_select_admin on public.app_settings;
create policy app_settings_select_admin on public.app_settings for select to authenticated
using (public.is_app_admin());
drop policy if exists app_settings_write_principal on public.app_settings;
create policy app_settings_write_principal on public.app_settings for all to authenticated
using (public.is_principal_admin()) with check (public.is_principal_admin());

drop policy if exists initial_stocks_select on public.initial_stocks;
create policy initial_stocks_select on public.initial_stocks for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists initial_stocks_write_admin on public.initial_stocks;
create policy initial_stocks_write_admin on public.initial_stocks for all to authenticated
using (public.can_edit_initial_stock()) with check (public.can_edit_initial_stock());

drop policy if exists global_factory_select on public.global_factory_initial;
create policy global_factory_select on public.global_factory_initial for select to authenticated
using (public.is_app_admin());
drop policy if exists global_factory_write_admin on public.global_factory_initial;
create policy global_factory_write_admin on public.global_factory_initial for all to authenticated
using (public.can_edit_initial_stock()) with check (public.can_edit_initial_stock());

drop policy if exists objectives_select on public.objectives;
create policy objectives_select on public.objectives for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists objectives_write_admin on public.objectives;
create policy objectives_write_admin on public.objectives for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists product_objectives_select on public.product_objectives;
create policy product_objectives_select on public.product_objectives for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists product_objectives_write_admin on public.product_objectives;
create policy product_objectives_write_admin on public.product_objectives for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists depot_monthly_packaging_select on public.depot_monthly_packaging;
create policy depot_monthly_packaging_select on public.depot_monthly_packaging for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists depot_monthly_packaging_write_admin on public.depot_monthly_packaging;
create policy depot_monthly_packaging_write_admin on public.depot_monthly_packaging for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists depot_monthly_products_select on public.depot_monthly_products;
create policy depot_monthly_products_select on public.depot_monthly_products for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists depot_monthly_products_write_admin on public.depot_monthly_products;
create policy depot_monthly_products_write_admin on public.depot_monthly_products for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists purchases_write_admin on public.purchases;
create policy purchases_write_admin on public.purchases for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists returns_select on public.packaging_returns;
create policy returns_select on public.packaging_returns for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists returns_write_admin on public.packaging_returns;
create policy returns_write_admin on public.packaging_returns for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists audits_select on public.audits;
create policy audits_select on public.audits for select to authenticated
using (public.is_app_admin() or created_by = auth.uid());
drop policy if exists audits_write_admin on public.audits;
drop policy if exists audits_write_allowed on public.audits;
create policy audits_write_allowed on public.audits for all to authenticated
using (public.is_app_admin() or (created_by = auth.uid() and public.can_read_location(location_id)))
with check (public.is_app_admin() or (created_by = auth.uid() and public.can_read_location(location_id)));

drop policy if exists finance_deposits_select on public.finance_deposits;
create policy finance_deposits_select on public.finance_deposits for select to authenticated using (true);
drop policy if exists finance_deposits_write_admin on public.finance_deposits;
create policy finance_deposits_write_admin on public.finance_deposits for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists finance_loans_select on public.finance_loans;
create policy finance_loans_select on public.finance_loans for select to authenticated using (true);
drop policy if exists finance_loans_write_admin on public.finance_loans;
create policy finance_loans_write_admin on public.finance_loans for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists finance_payments_select on public.finance_payments;
create policy finance_payments_select on public.finance_payments for select to authenticated using (true);
drop policy if exists finance_payments_write_admin on public.finance_payments;
create policy finance_payments_write_admin on public.finance_payments for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists capital_entries_select on public.capital_entries;
create policy capital_entries_select on public.capital_entries for select to authenticated using (true);
drop policy if exists capital_entries_write_admin on public.capital_entries;
create policy capital_entries_write_admin on public.capital_entries for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists capital_settings_select on public.capital_settings;
create policy capital_settings_select on public.capital_settings for select to authenticated using (true);
drop policy if exists capital_settings_write_admin on public.capital_settings;
create policy capital_settings_write_admin on public.capital_settings for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists app_events_select_principal on public.app_events;
create policy app_events_select_principal on public.app_events for select to authenticated
using (public.is_principal_admin());
