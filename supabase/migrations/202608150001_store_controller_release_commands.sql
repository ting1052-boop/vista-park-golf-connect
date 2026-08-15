-- Allow the store-local controller to receive session-release and manual actions.
-- Run in Supabase SQL Editor after the application deployment.

alter table public.store_controller_commands
  drop constraint if exists store_controller_commands_type_check;

alter table public.store_controller_commands
  add constraint store_controller_commands_type_check
  check (command_type in ('prepare_bay', 'release_bay', 'run_scripts'));
