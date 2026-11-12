# Opt-in technical communication monitor

Apply `202610220002_technical_monitor.sql` after the existing migrations and
`202610220001_ingest_hardening.sql`. This migration creates no schedule, enables
no rule, changes no firmware payload, and generates no readings. Its only event
is a technical warning about missing accepted readings, never a clinical event
or a battery threshold.

## Configure a device

An authenticated administrator can call the existing Supabase client:

```ts
const { data, error } = await supabase.rpc("configure_communication_rule", {
  p_device_id: deviceId,
  p_enabled: true,
  p_timeout_seconds: 90,
});
```

The timeout is an explicitly chosen technical value, bounded to 15..86400
seconds. Set `p_enabled: false` to disable the rule. No device is monitored
unless this RPC has enabled its rule. It checks the current administrator role,
locks the device first, increments the rule version on each configuration call,
and records actor, time, enabled state, timeout, and version in
`admin_audit_events` with `subject_type = 'device'`. Its response includes the
configuration and audit timestamps. Caregivers, anonymous clients, and the
service role cannot call this configuration RPC. Rules and evaluation state
remain in the private schema without API-role table access.

## Evaluation and event lifecycle

The service-only `evaluate_communication_rules(p_limit integer default 100)`
accepts batches of 1..1000. Its JSON result contains `checked`, `emitted`, and
`recovered` counts for this invocation. It locks devices first with
`FOR UPDATE SKIP LOCKED`, skips busy devices, and visits enabled rules by oldest
`last_checked_at` (unchecked rules first). Repeat bounded calls to cover larger
fleets; choose cadence and batch size for the number of enabled rules.

Silence starts at the latest of monitoring activation, the current assignment,
and `devices.last_received_at`. A warning is eligible when that timestamp plus
the configured timeout is reached. Enabling a rule gives a full timeout grace
period, including devices that have never delivered a reading. Timeout edits
retain the monitoring start and existing gaps. Reassignment or a device enabled
state change restarts the grace period; device-level opt-in persists.

`last_received_at` means an accepted **new** reading. Exact duplicate retries
deliberately do not advance it and cannot recover a gap. This measures new-data
availability, not proof of network connectivity or a person's condition.

Warnings reuse `alerts` with `kind = 'technical'`, `severity = 'warning'`,
`technical_rule = 'communication_timeout'`, and the configuration's
`rule_version`. A partial unique index permits only one unrecovered warning for
that device, assignment, and rule. Human acknowledgement or resolution does not
end the data gap, so repeated evaluation does not emit another warning.

On a later evaluation, a strictly advanced real `last_received_at` closes the
gap with `recovered_at` and `status = 'resolved'`. A later period of silence can
create another gap. Device disablement, reassignment, or rule disablement also
closes an outstanding warning. For these administrative closures,
`recovered_at` records closure, not evidence that readings resumed. Old event
person/assignment IDs are preserved. Existing assignment RLS protects both
alerts and their history, using existing Realtime source tables only.

The existing history trigger records automatic closure as `source = 'system'`
with no human actor, including closure caused by an administrator's operation.
Earlier human history and `triaged_by`/`triaged_at` are preserved. If a human
already resolved the event, closure sets `recovered_at` without adding a second
resolved status transition. No history is overwritten.

## Manual service invocation

From an already authorized server-side Supabase service client:

```ts
const { data, error } = await serviceClient.rpc(
  "evaluate_communication_rules",
  {
    p_limit: 100,
  },
);
```

Alternatively, an authorized database operator can invoke the function under
the explicitly granted service role, without an HTTP key:

```sql
begin;
set local role service_role;
select public.evaluate_communication_rules(100);
commit;
```

These snippets contain no credentials. Never put privileged clients or secrets
in browser code or firmware. Evaluation runs only when explicitly invoked;
there is no automatic background worker in this migration.

## Optional Supabase Cron

These are **operator opt-in examples**, not migration statements. No extension
installation, job creation, or remote call was executed for this feature.
Check availability and operator permissions before choosing this option.

Supabase documents enabling `pg_cron` in Dashboard Integrations. Its official
[installation guide](https://supabase.com/docs/guides/cron/install), including
the [SQL tab source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/cron/install.mdx),
provides this installation SQL:

```sql
create extension pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
```

Do not rerun installation when the extension is already enabled. As the
authorized database owner, an operator may then create a paused job. The
`cron.schedule` and `cron.alter_job` forms below follow Supabase's official
[Cron quickstart](https://supabase.com/docs/guides/cron/quickstart) and its
[SQL tab source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/cron/quickstart.mdx).

```sql
begin;
select cron.schedule(
  'sage-communication-monitor',
  '* * * * *',
  $$select public.evaluate_communication_rules(100);$$
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'sage-communication-monitor'),
  active := false
);
commit;
```

The same job name replaces an existing job, so review that name before use.
The one-minute example is a cadence choice, not a delivery guarantee; a
15-second timeout still waits for an evaluation, and larger fleets need enough
batch capacity. The job executes with the scheduling database role's privileges.
It requires no stored HTTP token. Activate it only after explicit operational
approval and after configuring the desired devices:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'sage-communication-monitor'),
  active := true
);
```

Pause using `active := false`; remove the job with
`select cron.unschedule('sage-communication-monitor');`. Job history remains in
`cron.job_run_details`; review its retention separately, as described in the
official quickstart. No schedule is enabled by default.

## Local verification

```text
node node_modules/vitest/vitest.mjs run tests/technical-monitor.test.ts --maxWorkers=1 --no-file-parallelism
```

The test file uses an isolated PGlite database and applies versioned migrations,
not `setup.sql`. It covers permissions, opt-in and timeout grace, bounded fair
batches, warning uniqueness despite manual triage, accepted-reading recovery,
duplicate retry behavior, configuration audit/versioning, administrative
closure, and assignment isolation. Silence is simulated only in test fixtures;
production creates no fake telemetry. This does not validate deployed Cron,
Supabase Realtime delivery, real PostgreSQL lock contention across sessions,
or hardware. Those require separate integration verification.
