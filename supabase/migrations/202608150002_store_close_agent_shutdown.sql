-- Allow a bay Agent to receive a graceful Windows shutdown command.
-- Run once in the Supabase SQL Editor before deploying the matching application code.

alter table public.store_controller_commands
  drop constraint if exists store_controller_commands_type_check;

alter table public.store_controller_commands
  add constraint store_controller_commands_type_check
  check (command_type in ('prepare_bay', 'release_bay', 'run_scripts', 'shutdown_pc'));
