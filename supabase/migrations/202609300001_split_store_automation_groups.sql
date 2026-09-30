alter table public.store_settings
  add column if not exists golf_schedule_enabled boolean not null default false,
  add column if not exists golf_open_time time,
  add column if not exists golf_close_time time,
  add column if not exists golf_last_opened_on date,
  add column if not exists golf_last_closed_on date,
  add column if not exists park_schedule_enabled boolean not null default false,
  add column if not exists park_open_time time,
  add column if not exists park_close_time time,
  add column if not exists park_last_opened_on date,
  add column if not exists park_last_closed_on date;

alter table public.store_settings
  drop constraint if exists store_settings_golf_automation_time_order_check;

alter table public.store_settings
  add constraint store_settings_golf_automation_time_order_check check (
    golf_open_time is null
    or golf_close_time is null
    or golf_open_time < golf_close_time
  );

alter table public.store_settings
  drop constraint if exists store_settings_park_automation_time_order_check;

alter table public.store_settings
  add constraint store_settings_park_automation_time_order_check check (
    park_open_time is null
    or park_close_time is null
    or park_open_time < park_close_time
  );

update public.store_settings
set
  golf_schedule_enabled = case when automation_schedule_enabled then true else golf_schedule_enabled end,
  golf_open_time = coalesce(golf_open_time, automation_open_time),
  golf_close_time = coalesce(golf_close_time, automation_close_time),
  golf_last_opened_on = coalesce(golf_last_opened_on, automation_last_opened_on),
  golf_last_closed_on = coalesce(golf_last_closed_on, automation_last_closed_on)
where automation_schedule_enabled = true
  and golf_open_time is null
  and golf_close_time is null;

-- 송도파크자이: 골프 A-01~A-06과 파크골프 P-01~P-02를 별도 운영한다.
update public.store_settings
set
  golf_schedule_enabled = true,
  golf_open_time = '05:50',
  golf_close_time = '23:20',
  park_schedule_enabled = true,
  park_open_time = '09:50',
  park_close_time = '21:30'
where store_id = 'b2f7192b-9472-4006-a58d-ffec3afc90ce';
