-- VISTA Park Golf Connect
-- Prevent duplicate active check-ins and speed up expired-session closeout.

create unique index if not exists access_sessions_one_active_per_reservation_idx
  on public.access_sessions (reservation_id)
  where reservation_id is not null
    and status in ('active', 'extended');

create index if not exists access_sessions_expired_closeout_idx
  on public.access_sessions (ends_at)
  where status in ('active', 'extended', 'overdue')
    and ends_at is not null;
