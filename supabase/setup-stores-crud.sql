-- VISTA Park Golf Connect
-- Enable real Supabase CRUD for the Stores screen.
-- Run this after setup-core.sql.

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

notify pgrst, 'reload schema';
