-- VISTA Park Golf Connect
-- Enforce one bay row per (store, bay_code). A duplicate A-01/A-02 pair had
-- crept in (seed row + admin-created row), letting the kiosk render a bay twice
-- and letting a stale session pin a "phantom" bay to in_use. Deduped rows were
-- removed manually; this index prevents the situation from recurring.

create unique index if not exists bays_store_bay_code_key
  on public.bays (store_id, bay_code);
