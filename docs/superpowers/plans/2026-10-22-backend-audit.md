# Backend SAGE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute in `site novo`, preserving user changes and deployed migrations.

**Goal:** Complete and verify the attached backend requirements in the new site.

**Architecture:** Preserve Supabase Auth/PostgREST/RPC/Realtime and Deno ingest.
Fix evidenced defects incrementally; use new SQL migrations for published schema.

**Tech Stack:** React/Vite, TypeScript, Zod, Supabase, PostgreSQL, Vitest/PGlite.

**Spec:** `../specs/2026-10-22-backend-audit-design.md`.

## Global Constraints

- Only `site novo`; no old-site or unrelated worktree edits.
- No real credentials in example files, frontend, logs or documentation.
- No fabricated clinical values/events, diagnoses or hardware validation.
- Preserve published migrations; no destructive database reset.
- Explicit user request permits proceeding through implementation without plan approval gates.
- Parent Git repository is not an isolated project; do not stage/commit unrelated files.

## Review Focus

- Credential confusion: reject project/admin keys as device tokens before storage.
- Idempotence and database access scopes: independent audit and targeted SQL regressions.
- Realtime/cache races: independent review and targeted tests when a defect is found.
- Missing/null readings and late arrivals: retain existing tests and contract.
- Deployment evidence: distinguish local mocks from live server checks and hardware.

## Tasks

- [x] Baseline: 119 tests pass; build passes with existing >500 kB chunk warning.
- [x] Add tests rejecting administrative keys, JWTs and malformed device tokens.
- [x] Watch failures, implement the minimal ingest-boundary change, rerun tests.
- [x] Migration `202610220001_ingest_hardening.sql`: authenticate before entering the locked ingestion function; keep locked revalidation and the existing transaction. Add `revoke_caregiver_link(target)` with device-first lock ordering and remove direct browser UPDATE of links. Test rejected callers, idempotent revoke and audit; use the RPC in Admin.
- [x] Migration `202610220002_technical_monitor.sql`: opt-in, versioned and audited communication rules; service-only bounded evaluation, deduplicated assignment-scoped events and recovery. Test RLS, rule versions, partial batches and no fabricated readings.
- [x] Review SQL and client findings; implement evidenced fixes with regressions.
- [x] Update contract, setup, environment example and requirement coverage report.
- [x] Run complete serial tests, build/typecheck, formatting and client-secret scan.
- [x] Review changes and record validation/deployment/hardware limits.

## Ledger

2026-10-22: React/Supabase architecture confirmed. Existing six migrations and
deployed ingest preserved. Baseline 119/119, build successful. Independent
read-only audits cover SQL/RLS and dashboard/realtime. Work remains in place as
explicitly requested; no parent-repository commits or moves.

HTTP token tests: six new cases failed with 200 before the boundary fix; all
50 ingestion tests pass after the fix. SQL review accepted invalid-token lock
contention and link-revocation lock inversion. Preserve the documented meaning
of last_received_at (new accepted readings): retries do not manufacture freshness.
Add a communication monitor only after explicit per-device configuration;
no scheduler or rules enabled implicitly.

2026-10-26: resumed remaining work. Corrected nullable CHECK, device-first human
triage locking after independent review, Node/no-DOM client bootstrap, test row
types and timestamp microsecond ordering. Full suite: 181/181 in 15 files;
build and Deno passed. Public/auth/realtime browser scripts passed; regression
retains its previously documented native-Back support-draft failure (8/9).
Published the two new migrations and ingest v2 with explicit user approval.
All eight local migrations match deployed history; no fake readings, configured
monitor rules or schedules were created. See the audit and deployment records.
