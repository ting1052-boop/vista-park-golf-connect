## VISTA shared coordination rules

Before planning, editing, testing, committing, or deploying:

1. Run `npm run preflight`.
2. Read `docs/SHARED-HANDOFF.md` completely.
3. Check `git status --short` and preserve changes made by other agents.
4. Register material work in the `현재 작업` table before editing.

After material work:

1. Update `docs/SHARED-HANDOFF.md` with changed files, verification, commit/deploy state, and remaining work.
2. Remove or complete your row in `현재 작업`.
3. Never record passwords, API keys, tokens, or secret values in the handoff.

Do not edit files currently owned by another active row unless the user explicitly asks you to take over. Production database writes, deployments, schema changes, and destructive operations require explicit user approval.

## Imported Claude Cowork project instructions
