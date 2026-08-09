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

insert into public.bremers (id, code, label, excel_label, price, sort_order)
values ('BAC', 'Bac vide', 'Bac vide', 'Bac vide', 4500, 60)
on conflict (id) do update
set code = excluded.code,
    label = excluded.label,
    excel_label = excluded.excel_label,
    price = excluded.price,
    sort_order = excluded.sort_order;

insert into public.initial_stocks (scope, location_id, bremer_id, quantity, value)
select 'depot'::public.stock_scope, l.id, 'BAC', 0, 0
from public.locations l
on conflict (scope, location_id, bremer_id) do nothing;

insert into public.initial_stocks (scope, location_id, bremer_id, quantity, value)
select 'factory'::public.stock_scope, l.id, 'BAC', 0, 0
from public.locations l
on conflict (scope, location_id, bremer_id) do nothing;

insert into public.global_factory_initial (bremer_id, quantity, value)
values ('BAC', 0, 0)
on conflict (bremer_id) do nothing;

drop trigger if exists depot_monthly_packaging_touch_updated_at on public.depot_monthly_packaging;
create trigger depot_monthly_packaging_touch_updated_at before update on public.depot_monthly_packaging
for each row execute function public.touch_updated_at();

drop trigger if exists depot_monthly_products_touch_updated_at on public.depot_monthly_products;
create trigger depot_monthly_products_touch_updated_at before update on public.depot_monthly_products
for each row execute function public.touch_updated_at();

alter table public.depot_monthly_packaging enable row level security;
alter table public.depot_monthly_products enable row level security;
alter table public.finance_payments enable row level security;

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

drop policy if exists finance_payments_select on public.finance_payments;
create policy finance_payments_select on public.finance_payments for select to authenticated using (true);

drop policy if exists finance_payments_write_admin on public.finance_payments;
create policy finance_payments_write_admin on public.finance_payments for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

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
