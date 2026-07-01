-- VISTA Park Golf Connect
-- Enforce at the database level that a bay cannot hold two overlapping
-- active reservations. The member reservation flow already checks this
-- client-side (src/app/member/app/page.tsx), but that only protects the
-- happy path; this constraint is the real guarantee against race
-- conditions and admin-side edits.
--
-- Before running this on an environment with existing data, run
-- supabase/check-reservation-bay-overlaps.sql first and resolve any rows
-- it returns.

-- Required so a GiST index can also enforce equality (bay_id =) alongside
-- the range overlap (&&) operator.
create extension if not exists "btree_gist";

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_bay_time_excl'
  ) then
    alter table public.reservations
      add constraint reservations_bay_time_excl
      exclude using gist (
        bay_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (bay_id is not null and status not in ('cancelled', 'no_show'));
  end if;
end $$;
