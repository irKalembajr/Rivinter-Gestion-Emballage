-- Mise à jour non destructive : gestion journalière des emballages.
create table if not exists public.daily_stocks (
  date date not null,
  location_id text not null references public.locations(id) on delete cascade,
  bremer_id text not null references public.bremers(id) on delete cascade,
  quantity numeric not null default 0 check (quantity >= 0),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (date, location_id, bremer_id)
);

drop trigger if exists daily_stocks_touch_updated_at on public.daily_stocks;
create trigger daily_stocks_touch_updated_at before update on public.daily_stocks
for each row execute function public.touch_updated_at();

alter table public.daily_stocks enable row level security;
drop policy if exists daily_stocks_select on public.daily_stocks;
create policy daily_stocks_select on public.daily_stocks for select to authenticated
using (public.can_read_location(location_id));
drop policy if exists daily_stocks_write_admin on public.daily_stocks;
create policy daily_stocks_write_admin on public.daily_stocks for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

-- Aligne les valeurs historiques sur les constantes Bremers.
update public.initial_stocks s set value = s.quantity * b.price
from public.bremers b where b.id = s.bremer_id;
update public.global_factory_initial s set value = s.quantity * b.price
from public.bremers b where b.id = s.bremer_id;
