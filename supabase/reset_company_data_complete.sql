create or replace function public.reset_company_data(p_restore_seed boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
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

  insert into public.app_events (actor_id, action, details)
  values (
    v_actor,
    'reset_company_data',
    jsonb_build_object(
      'restore_seed', p_restore_seed,
      'mode', case when p_restore_seed then 'with_reference_seed' else 'empty_user_entries' end,
      'preserved', jsonb_build_array('locations', 'bremers', 'products', 'product_prices', 'profiles')
    )
  );
end;
$$;
