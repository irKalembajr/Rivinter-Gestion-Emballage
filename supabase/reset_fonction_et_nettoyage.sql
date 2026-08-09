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

begin;

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
values ('initial_stock', jsonb_build_object('locked', false, 'locked_at', null, 'locked_by', null));

commit;

select 'purchases' as table_name, count(*) as remaining from public.purchases
union all select 'packaging_returns', count(*) from public.packaging_returns
union all select 'audits', count(*) from public.audits
union all select 'objectives', count(*) from public.objectives
union all select 'product_objectives', count(*) from public.product_objectives
union all select 'depot_monthly_packaging', count(*) from public.depot_monthly_packaging
union all select 'depot_monthly_products', count(*) from public.depot_monthly_products
union all select 'finance_payments', count(*) from public.finance_payments
union all select 'finance_deposits', count(*) from public.finance_deposits
union all select 'finance_loans', count(*) from public.finance_loans
union all select 'capital_entries', count(*) from public.capital_entries
union all select 'capital_settings', count(*) from public.capital_settings
union all select 'initial_stocks', count(*) from public.initial_stocks
union all select 'global_factory_initial', count(*) from public.global_factory_initial
union all select 'app_events', count(*) from public.app_events;
