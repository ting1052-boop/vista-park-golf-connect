-- WOL/네트워크 정보: 세팅 도구가 수집한 최신 값을 PC 등록부에 보관한다.
alter table public.bay_pc_registry
  add column if not exists wol_mac_address text,
  add column if not exists mac_addresses jsonb not null default '[]'::jsonb,
  add column if not exists ipv4_address inet,
  add column if not exists network_prefix_length smallint,
  add column if not exists wol_broadcast_address inet,
  add column if not exists wake_on_lan_status text not null default 'unknown',
  add column if not exists power_control_method text not null default 'unknown',
  add column if not exists network_collected_at timestamptz;

alter table public.bay_pc_registry
  drop constraint if exists bay_pc_registry_wol_mac_check,
  drop constraint if exists bay_pc_registry_network_prefix_check,
  drop constraint if exists bay_pc_registry_wol_status_check,
  drop constraint if exists bay_pc_registry_power_method_check;

alter table public.bay_pc_registry
  add constraint bay_pc_registry_wol_mac_check
    check (wol_mac_address is null or wol_mac_address ~ '^[0-9A-F]{12}$'),
  add constraint bay_pc_registry_network_prefix_check
    check (network_prefix_length is null or network_prefix_length between 0 and 32),
  add constraint bay_pc_registry_wol_status_check
    check (wake_on_lan_status in ('enabled', 'disabled', 'unknown')),
  add constraint bay_pc_registry_power_method_check
    check (power_control_method in ('wol_agent', 'wol_only', 'unknown'));

create index if not exists bay_pc_registry_wol_mac_idx on public.bay_pc_registry(wol_mac_address);

comment on column public.bay_pc_registry.wol_mac_address is 'WOL 대표 MAC (대문자 12자리)';
comment on column public.bay_pc_registry.mac_addresses is '필터를 통과한 물리 MAC 목록';
comment on column public.bay_pc_registry.network_collected_at is '네트워크 정보 수집 시각';
