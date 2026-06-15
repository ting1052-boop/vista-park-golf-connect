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

create or replace function public.sync_store_bay_count_from_bays()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_store_id uuid;
begin
  target_store_id := coalesce(new.store_id, old.store_id);

  if target_store_id is not null then
    update public.stores
       set bay_count = (
             select count(*)
               from public.bays
              where store_id = target_store_id
           ),
           updated_at = now()
     where id = target_store_id;
  end if;

  if tg_op = 'UPDATE' and old.store_id is distinct from new.store_id and old.store_id is not null then
    update public.stores
       set bay_count = (
             select count(*)
               from public.bays
              where store_id = old.store_id
           ),
           updated_at = now()
     where id = old.store_id;
  end if;

  return null;
end;
$$;

drop trigger if exists bays_sync_store_bay_count_after_change on public.bays;
create trigger bays_sync_store_bay_count_after_change
after insert or delete or update of store_id on public.bays
for each row execute function public.sync_store_bay_count_from_bays();

update public.stores
   set bay_count = bay_totals.total_count,
       updated_at = now()
  from (
    select s.id, count(b.id)::integer as total_count
      from public.stores s
      left join public.bays b on b.store_id = s.id
     group by s.id
  ) as bay_totals
 where public.stores.id = bay_totals.id;

notify pgrst, 'reload schema';
