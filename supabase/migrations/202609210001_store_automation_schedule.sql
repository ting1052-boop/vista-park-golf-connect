alter table public.store_settings
  add column if not exists automation_schedule_enabled boolean not null default false,
  add column if not exists automation_open_time time,
  add column if not exists automation_close_time time,
  add column if not exists automation_timezone text not null default 'Asia/Seoul',
  add column if not exists automation_last_opened_on date,
  add column if not exists automation_last_closed_on date;

alter table public.store_settings
  drop constraint if exists store_settings_automation_time_order_check;

alter table public.store_settings
  add constraint store_settings_automation_time_order_check check (
    automation_open_time is null
    or automation_close_time is null
    or automation_open_time < automation_close_time
  );
