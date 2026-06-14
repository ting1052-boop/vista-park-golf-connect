-- VISTA Park Golf Connect
-- Fix for bay delete not applying in the admin Bays screen.
-- Run this in Supabase SQL Editor.

alter table public.bays enable row level security;

drop policy if exists bays_select_public_demo on public.bays;
create policy bays_select_public_demo on public.bays
  for select using (true);

drop policy if exists bays_insert_public_demo on public.bays;
create policy bays_insert_public_demo on public.bays
  for insert with check (true);

drop policy if exists bays_update_public_demo on public.bays;
create policy bays_update_public_demo on public.bays
  for update using (true)
  with check (true);

drop policy if exists bays_delete_public_demo on public.bays;
create policy bays_delete_public_demo on public.bays
  for delete using (true);

-- Make sure related reservations do not block bay deletion.
do $$
begin
  if to_regclass('public.reservations') is not null then
    alter table public.reservations drop constraint if exists reservations_bay_id_fkey;
    alter table public.reservations
      add constraint reservations_bay_id_fkey
      foreign key (bay_id) references public.bays(id) on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';
