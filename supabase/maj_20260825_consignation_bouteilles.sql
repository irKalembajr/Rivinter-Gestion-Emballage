begin;

alter table public.packaging_returns
  add column if not exists bottle_quantity numeric not null default 0;

-- La nouvelle consignation est autonome: le BV n'est plus créé dans un
-- module finance. Les anciennes liaisons bank_deposit_id restent conservées.
alter table public.packaging_returns
  add column if not exists bv_number text;
alter table public.packaging_returns
  add column if not exists bv_amount numeric not null default 0;

update public.packaging_returns r
set bv_number = coalesce(r.bv_number, r.ref),
    bv_amount = case when r.bv_amount = 0 then coalesce(d.amount, r.amount, 0) else r.bv_amount end
from public.finance_deposits d
where r.bank_deposit_id = d.id
  and r.movement_type in ('consignment', 'bottle_consignment');

update public.packaging_returns
set bv_number = coalesce(bv_number, ref),
    bv_amount = case when bv_amount = 0 then coalesce(amount, 0) else bv_amount end
where movement_type in ('consignment', 'bottle_consignment')
  and bank_deposit_id is null;

alter table public.packaging_returns
  drop constraint if exists packaging_returns_movement_type_check;
alter table public.packaging_returns
  add constraint packaging_returns_movement_type_check
  check (movement_type in ('return', 'consignment', 'bottle_consignment'));

alter table public.finance_deposits
  drop constraint if exists finance_deposits_purpose_check;
alter table public.finance_deposits
  add constraint finance_deposits_purpose_check
  check (purpose in ('versement', 'achat_direct', 'consignation', 'consignation_bouteilles', 'autre'));

commit;
