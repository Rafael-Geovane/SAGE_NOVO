# SGE-001 Simulator Implementation Plan

> Use superpowers:executing-plans and test-driven-development. Work only in `site novo`.

**Goal:** Synthetic vest readings every 3000 ms, with usable test controls.
**Architecture:** Isolated in-memory reducer, React page and existing UI primitives.
**Spec:** `../specs/2026-10-29-vest-simulator.md`.

## Constraints

- Preserve real ingestion, access control, activation and user changes.
- Never persist simulated readings, people or credentials in Supabase/storage.
- Mark all test values/events explicitly as simulated; no clinical inference.
- Reuse the existing frontend stack and visual tokens; no new dependencies.

## Tasks

- [x] Write failing tests for generator, 3000 ms clock, pause, disconnect, partial readings, test events and bounded history.
- [x] Implement `src/features/simulator/engine.ts` and run focused tests.
- [x] Create `src/pages/VestTest.tsx` and scoped CSS; integrate route and existing workspace navigation.
- [x] Verify controls, timer cleanup, desktop/mobile layout and absence of telemetry writes in browser tests.
- [x] Run full tests, build and format; document the public test URL and boundaries.

## Ledger

29/10: baseline 192 tests passed, including existing pairing changes. New engine
tests failed before implementation, then 9 passed. Full suite 201/201 in 17 files.
Browser scenarios passed with a real 3-second timer and paused interval, event,
battery, partial data, disconnect/reconnect, reset/reload and no Supabase writes.
Responsive regression found chart aspect-ratio overflow at 360px; fixed explicit
width/height and repeated at 360/390/768/1440 successfully. Screenshots inspected.
Read-only independent review found no blockers. Production pairing, ingestion,
database schema and permissions were not changed.
Final build and formatting passed; client scan checked 41 files with no secret
findings. Existing bundle-size and dependency-comment warnings remain warnings.
