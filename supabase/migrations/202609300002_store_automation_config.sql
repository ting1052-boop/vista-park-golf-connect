alter table public.store_settings
  add column if not exists automation_schedule_config jsonb;

alter table public.store_settings
  drop constraint if exists store_settings_automation_schedule_config_check;

alter table public.store_settings
  add constraint store_settings_automation_schedule_config_check
  check (
    automation_schedule_config is null
    or (
      jsonb_typeof(automation_schedule_config) = 'object'
      and automation_schedule_config ? 'mode'
      and automation_schedule_config->>'mode' in ('store', 'zones')
    )
  );
