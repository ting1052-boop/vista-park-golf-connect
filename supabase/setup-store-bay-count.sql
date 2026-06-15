-- VISTA Park Golf Connect
-- Add store bay count and keep store/bay CRUD policies ready for the admin screens.
-- Run this in Supabase SQL Editor, then redeploy or refresh the app.

alter table public.stores
  add column if not exists bay_count integer not null default 0;

alter table public.stores
  drop constraint if exists stores_bay_count_check;

alter table public.stores
  add constraint stores_bay_count_check check (bay_count between 0 and 99);

alter table public.stores enable row level security;

drop policy if exists stores_select_public_demo on public.stores;
create policy stores_select_public_demo on public.stores
  for select using (true);

drop policy if exists stores_insert_public_demo on public.stores;
create policy stores_insert_public_demo on public.stores
  for insert with check (true);

drop policy if exists stores_update_public_demo on public.stores;
create policy stores_update_public_demo on public.stores
  for update using (true)
  with check (true);

drop policy if exists stores_delete_public_demo on public.stores;
create policy stores_delete_public_demo on public.stores
  for delete using (true);

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

notify pgrst, 'reload schema';
