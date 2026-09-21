# VISTA Store Controller

This small Windows PowerShell program runs on the same laptop as Home Assistant.
It checks the VISTA server every few seconds for a bay preparation command, then
calls the LAN-only Home Assistant instance. The kiosk browser never calls Home
Assistant directly.

## Before installation

1. Deploy the VISTA application code.
2. In Supabase SQL Editor, run `supabase/migrations/202608110001_store_controller_commands.sql`.
3. In Vercel Production environment variables, set:
   - `STORE_CONTROLLER_ENABLED=true`
   - `STORE_CONTROLLER_TOKEN` to one new long random value.
4. Redeploy Vercel after adding the variables.

## Install on the Home Assistant Windows laptop

1. Copy this `store-controller` folder to `C:\VISTA\store-controller`.
2. Copy `controller.config.example.json` as `controller.config.json`.
3. Open `controller.config.json` in Notepad and fill in the assigned `storeId`,
   the same controller token used in Vercel, and the Home Assistant long-lived
   access token. Older Siheung configs without `storeId` continue to use the
   Siheung store by default.
4. Double-click `start-controller.cmd`. Keep the first test window open.
5. Once the test succeeds, open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```

The Windows Task Scheduler then starts the controller automatically as soon as
Windows boots, even before sign-in. It runs as SYSTEM and restarts after one
minute if the process stops. Runtime messages are saved to `controller.log`.

Re-run `install-startup.ps1` after replacing the controller files so the more
reliable startup settings are applied.

## What should happen

1. A kiosk or administrator starts bay A-02.
2. Vercel records a `prepare_bay` command.
3. This controller claims the command within about five seconds.
4. It calls `script.bay2_on` in Home Assistant.
5. Home Assistant runs the configured sequence: projector ON, delay, PC WOL.
6. The result appears in the VISTA automation log.

When the store open/close schedule is enabled in Admin > Automation, this same
poll runs the daily preparation and safe closing checks. Apply
`supabase/migrations/202609210001_store_automation_schedule.sql` before enabling
that schedule. Closing waits until there are no active or overdue sessions.

No real tokens belong in GitHub. `controller.config.json` is ignored by Git.
