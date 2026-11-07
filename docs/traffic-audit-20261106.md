# VISTA traffic audit

## Verified service limits

- Supabase HH SQUARE Free, cycle 2026-10-14 through 2026-11-14.
- UI observed 2026-11-06: uncached egress 11.575 GB / 5 GB; requests restricted (402).
- Database size about 30.54 MB; storage zero. This is a transfer quota incident, not a database capacity incident.
- Log ingestion 14.915 GB is a separate metric, not proof that logs caused the egress restriction.
- Vercel UI observed 2026-11-02: included credit $18.10/$20, function provisioned memory $9.60. These are separate provider limits.

## Boundaries

No payment, plan change, production writes, HA changes, power commands or deployments authorized by this audit.
Code inspection identifies avoidable traffic, but does not establish per-store billing attribution.
Reducing traffic does not immediately remove an already imposed provider restriction.

## Operating model

- Keep commercial reservation/admission/time control separate from Songdo observation-only behavior.
- Keep authenticated, store-scoped manual power control; do not trade authorization for caching.
- Keep local HA time schedules authoritative where already migrated. Shutdown paths that use VISTA still require cloud availability.
- Local game sampling and on-screen timers need not send a cloud request for every sample or timer tick.
- Existing field binaries do not change when web code is deployed.

## Rollout gates

1. Validate and deploy only the scoped server optimization after approval.
2. Measure daily Supabase egress and Vercel function usage after restoration, with comparable operating hours.
3. Test reduced-frequency Agent transport on one Songdo PC before replacing other binaries; preserve field detection features and configuration.
4. Verify normal shutdown command reception, offline status timing, event replay and duplicate suppression.
5. Target less than 4 GB per full Supabase cycle for headroom, rather than assuming the 5 GB quota will suffice.

## Remaining evidence

Exact live per-store request rates and response bytes, installed Agent transport behavior, and full-cycle savings remain unverified.
Do not estimate savings solely from PC counts or claim a free-tier guarantee.

## Agent release gate rechecked 2026-11-07

- No field executable/configuration was accessed in this work. Field 0.9.10/0.9.15 observations in the ledger are historical; local 0.9.9 is not a safe replacement merely because its transport is newer.
- electron-main.js still references ROOT/golf-input-snapshot.ps1; the helper is absent from the tracked/working source inventory. Release remains blocked, not fixed by inventing an input detector.
- observer-transport retryAt can be reached while the previous nextAt remains in the future; an early event-triggered failure may wait for that normal deadline. Add a fake-clock regression and reconcile retry gating before shipping.
- loadSession catches session errors and falls back locally. A successful heartbeat then resets transport failures; session-only failures are not fully covered by backoff. Preserve commercial offline-session semantics when repairing this.
- Before release: reconcile field source/binary hash, effective config and startup entry; restore the verified helper; test early-event retries, session-only failures, outbox ACK replay, shutdown reception and rollback on one PC. No version downgrade, installer or binary rollout in this task.

## Web/server follow-up implemented 2026-11-07 (not deployed)

- visible-poller.ts: one in-flight status read; 10-second whole-read timeout; failure delay doubles from at least 15 seconds up to120 seconds; success restores policy delay. Manual refresh queues at most one follow-up behind an existing read. Disposal aborts reads and suppresses old updates.
- automation-client/page: store-keyed lifetime, fresh pending fast polling limited to30 seconds, manual/action refresh retained. No command POST, auth or session logic modified.
- dashboard-client: hidden-tab Realtime callbacks skip router.refresh; existing visibility handler catches up. Existing dirty PC offline wording preserved.
- automation-status.ts: PostgREST JSON projections response_payload->steps and payload->scripts instead of both full objects. Same store/status/order/200-row window; no global cache or limit reduction. The historical200-row horizon itself is unchanged; a complete per-script history beyond that horizon needs a separately approved indexed query/RPC design.
- check-bay-operating-state mock updated to reflect projected response shape. New check-automation-status-projection uses the real Supabase SDK and mocked HTTP to verify query shape, rare scripts within200 rows, pending/failure parity, null/malformed parity and reduced fixture transfer.
- check-web-polling covers request overlap, timeout, recovery, repeated errors, manual retry, visibility and stale-store disposal; source wiring assertions included. It is not a browser E2E test.
- Server-only deployment enables these web/DB-response savings and prior minimal command candidate projections. Field Agent and controller frequencies remain unchanged until separately updated; no free-tier guarantee.
- Validation: preflight; polling-egress, web-polling, automation-status-projection, bay-operating-state, Songdo card checks; observer tests9/9 using --test-isolation=none; worker typecheck/targeted ESLint; main diff check. Initial node test child spawning EPERM was an environment restriction, not test failure. Full build result recorded in shared handoff.
- No production requests/writes, schema changes, HA/power operations, install, commit, push or deployment. Live savings and authenticated browser/hardware end-to-end flows remain unverified.

## Source audit and first patch

- Legacy Agent shared configuration is 15 seconds (code fallback 3 seconds); each tick performs session GET and heartbeat POST. No legacy single-flight or error backoff.
- Songdo negotiated observer transport is present only in dirty local source: heartbeat every 60 seconds plus changes, session polling removed after negotiation. Release remains blocked by missing golf-input-snapshot.ps1 and unreconciled newer field versions. Do not distribute an old binary over them.
- Nine PCs, 16 hours/day, 30 days: nominal 15-second paired calls = 2,073,600/month; 60-second observer calls = 259,200/month plus events/retries. This is 87.5% fewer HTTP requests, not a measured byte or invoice reduction.
- Controller intended default is 5 seconds, with no failure backoff; logging throttle does not throttle requests.
- Dashboard visible polling is 60 seconds in Songdo, 15 elsewhere. Realtime callbacks can still refresh hidden tabs.
- Automation pending-command mode polls at 5 seconds; failures retain pending state and can keep this cadence. Overlap/backoff protection remains to implement.
- Agent identity lookup already projects six fields; no full telemetry read or authorization cache needed there.
- getLatestScriptRuns reads up to 200 command/response JSON records per refresh: further optimization needs tests preserving latest-per-script history.
- First patch: pending command lookup selects only id and attempts in agent-commands.ts and controller commands route. Full command payload remains fetched after conditional claim. Store scoping and revoked-token checks unchanged.
- Added scripts/check-polling-egress.mjs. Worker verified typecheck, targeted ESLint, polling egress tests, observer protocol tests and diff checks. Main reviewed scoped diff. No production or hardware test, build, commit or deployment performed.
- First patch saves duplicate queued payload transfer only; idle-polling traffic is unchanged. Overall remediation is not complete.
