-- 202610040001이 이미 적용된 환경에서도 송도 정시 이용창을 안전하게 수용한다.
alter table public.agent_usage_events
  add column if not exists window_policy text not null default 'rolling_60';

update public.agent_usage_events
set window_policy = 'rolling_60'
where window_policy is null;

alter table public.agent_usage_events
  drop constraint if exists agent_usage_events_window_policy_check,
  drop constraint if exists agent_usage_events_ends_at_check;

alter table public.agent_usage_events
  add constraint agent_usage_events_window_policy_check
    check (window_policy in ('rolling_60', 'clock_hour')),
  add constraint agent_usage_events_ends_at_check
    check (ends_at > started_at and ends_at <= started_at + interval '60 minutes');
