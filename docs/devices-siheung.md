# VISTA Park Golf Connect - Siheung Showroom Devices

## Purpose

This document fixes the first field-test device list for the Siheung showroom.
VISTA controls automation through Home Assistant scripts, not by talking to Hejhome or Tapo directly.

## Confirmed Devices

| Area | Device | Provider | Control Role | Notes |
| --- | --- | --- | --- | --- |
| Common | Golf room light | Hejhome | Common ON/OFF | Shared device. Turn on for first entry, turn off after last exit. |
| Common | Lobby/Hall light (`비스타 홀.`) | Hejhome | Common ON/OFF | Shared device. Include in `shared_on` and `shared_off`. |
| Common | Golf room AC | Hejhome | Common ON/OFF | IR/HVAC device. State read-back may be unreliable. |
| Common | Lobby/Hall AC | Hejhome | Common ON/OFF | Shared device. Keep state label as requested/assumed unless HA can read state. |
| Entry | Automatic door | Hejhome | Excluded | Excluded from phase 1 automation for safety and operations. |
| Bay 1 | PC | Tapo | Bay ON/OFF | Power-on boots PC automatically. Avoid hard power-off during active use. |
| Bay 1 | Projector | Hejhome | Bay ON/OFF | Controlled with Hejhome plug/switch/scene. |
| Bay 1 | Receiver | Hejhome | Bay ON/OFF | Bay 1 only. |
| Bay 2 | PC | Tapo | Bay ON/OFF | Power-on boots PC automatically. |
| Bay 2 | Projector | Hejhome | Bay ON/OFF | Controlled with Hejhome plug/switch/scene. |
| Bay 3 | PC | Tapo | Bay ON/OFF | Power-on boots PC automatically. |
| Bay 3 | Projector | Hejhome | Bay ON/OFF | Controlled with Hejhome plug/switch/scene. |

## Control Rules

1. Common devices use reference counting.
   - First active bay entry turns common devices ON.
   - Last active bay exit turns common devices OFF.
2. Bay devices follow reservation/session state.
   - Enter: PC ON, projector ON, receiver ON if mapped.
   - Exit: projector/receiver OFF first, PC OFF only after the session is complete.
3. IR devices should be displayed carefully.
   - Use "requested ON/OFF" or "assumed state" when state read-back is not reliable.
4. Automatic door is excluded from phase 1.
   - Keep it out of automatic scenes until emergency, safety, and manual override rules are documented.
5. Home Assistant owns device-specific details.
   - VISTA calls `script.*`.
   - If a device changes, edit `homeassistant/scripts.yaml` mapping, not VISTA app code.

## Recommended Field Test Order

1. Install Home Assistant on the showroom network.
2. Connect one Tapo plug first.
3. Run VISTA `/api/automation/test` with one script.
4. Add Hejhome scene/switch mappings.
5. Test Bay 1 enter/exit.
6. Enable reference-counted common ON/OFF.
7. Connect reservation and access-session state after manual testing passes.
