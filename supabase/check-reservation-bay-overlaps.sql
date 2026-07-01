-- VISTA Park Golf Connect
-- Diagnostic: find existing reservations that overlap on the same bay.
-- Run this BEFORE applying migrations/202607010001_reservations_bay_time_exclusion.sql.
-- If this returns any rows, resolve the conflicts (cancel/reassign one side)
-- first, or the "alter table ... add constraint" step in that migration will
-- fail with "conflicting key value violates exclusion constraint".

select
  a.id as reservation_a,
  b.id as reservation_b,
  a.bay_id,
  a.status as status_a,
  b.status as status_b,
  a.starts_at as a_starts_at,
  a.ends_at as a_ends_at,
  b.starts_at as b_starts_at,
  b.ends_at as b_ends_at
from public.reservations a
join public.reservations b
  on a.bay_id = b.bay_id
  and a.id < b.id
  and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
where a.bay_id is not null
  and a.status not in ('cancelled', 'no_show')
  and b.status not in ('cancelled', 'no_show')
order by a.bay_id, a.starts_at;
