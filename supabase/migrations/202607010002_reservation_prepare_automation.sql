-- Tracks whether a confirmed reservation has already triggered the
-- five-minute-before Home Assistant preparation flow.

alter table public.reservations
  add column if not exists automation_prepare_status text not null default 'pending',
  add column if not exists automation_prepared_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_automation_prepare_status_check'
  ) then
    alter table public.reservations
      add constraint reservations_automation_prepare_status_check
      check (automation_prepare_status in ('pending', 'success', 'failed', 'skipped'));
  end if;
end $$;

create index if not exists reservations_prepare_due_idx
  on public.reservations (status, automation_prepared_at, starts_at)
  where bay_id is not null;
