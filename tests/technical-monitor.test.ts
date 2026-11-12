import { PGlite } from "@electric-sql/pglite";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

const pg = new PGlite();
const admin = randomUUID();
const caregiver = randomUUID();
const outsider = randomUUID();
const person = randomUUID();
const otherPerson = randomUUID();
let codeNumber = 700;

beforeAll(async () => {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create publication supabase_realtime;
  `);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter(
      (name) =>
        name.endsWith(".sql") && name <= "202610220002_technical_monitor.sql",
    )
    .sort())
    await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
  await pg.query("insert into auth.users values($1,'{}'),($2,'{}'),($3,'{}')", [
    admin,
    caregiver,
    outsider,
  ]);
  await pg.query("update profiles set role='admin' where id=$1", [admin]);
  await pg.query(
    "insert into people(id,display_name,consent_recorded_at,consent_recorded_by) values($1,'Test person',now(),$3),($2,'Other person',now(),$3)",
    [person, otherPerson, admin],
  );
}, 30000);
beforeEach(() => pg.exec("begin"));
afterEach(() => pg.exec("rollback"));
afterAll(() => pg.close());

async function asRole(
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
  user = "",
) {
  await pg.exec(`set local role ${role}`);
  await pg.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  // A savepoint keeps expected permission errors from aborting the test fixture.
  await pg.exec("savepoint role_call");
  try {
    const result = await pg.query<Record<string, unknown>>(sql, params);
    await pg.exec("release savepoint role_call");
    return result;
  } catch (error) {
    await pg.exec(
      "rollback to savepoint role_call; release savepoint role_call",
    );
    throw error;
  } finally {
    await pg.exec("reset role");
    await pg.query("select set_config('request.jwt.claim.sub','',true)");
  }
}
const asUser = (user: string, sql: string, params: unknown[] = []) =>
  asRole("authenticated", sql, params, user);
const configure = (
  deviceId: string,
  enabled = true,
  seconds: number | null = 15,
) =>
  asUser(admin, "select configure_communication_rule($1,$2,$3) result", [
    deviceId,
    enabled,
    seconds,
  ]);
async function evaluate(limit: number | null = 100) {
  const result = await asRole(
    "service_role",
    "select evaluate_communication_rules($1) result",
    [limit],
  );
  return result.rows[0].result as {
    checked: number;
    emitted: number;
    recovered: number;
  };
}
async function device() {
  const code = `SGE-${codeNumber++}`;
  const tokenHash = createHash("sha256")
    .update(`test-only-${code}`)
    .digest("hex");
  const result = await pg.query<{ id: string; assignment_id: string }>(
    "insert into devices(code,person_id,assigned_at) values($1,$2,clock_timestamp()-interval '1 day') returning id,assignment_id",
    [code, person],
  );
  const d = { ...result.rows[0], code, tokenHash };
  await pg.query(
    "insert into private.device_credentials(device_id,token_hash) values($1,$2)",
    [d.id, tokenHash],
  );
  await asUser(
    admin,
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [caregiver, d.id],
  );
  return d;
}
async function expire(deviceId: string) {
  // Simulate elapsed silence without sleeping or manufacturing telemetry.
  await pg.query(
    "update private.communication_rules set monitoring_since=clock_timestamp()-interval '2 minutes' where device_id=$1",
    [deviceId],
  );
  await pg.query(
    "update devices set last_received_at=clock_timestamp()-interval '2 minutes' where id=$1",
    [deviceId],
  );
}
async function gaps(deviceId: string) {
  return (
    await pg.query<Record<string, unknown>>(
      "select * from alerts where device_id=$1 and technical_rule='communication_timeout' order by created_at,id",
      [deviceId],
    )
  ).rows;
}
async function ingest(d: Awaited<ReturnType<typeof device>>, input?: object) {
  const payload = input ?? {
    schema_version: 1,
    device_code: d.code,
    message_id: randomUUID(),
    recorded_at: new Date().toISOString(),
    metrics: {},
    event: null,
  };
  const result = await asRole(
    "service_role",
    "select ingest_telemetry($1::jsonb,$2,120) result",
    [JSON.stringify(payload), d.tokenHash],
  );
  return { payload, response: result.rows[0].result };
}

it("requires a current administrator for configuration and keeps rules private", async () => {
  const d = await device();
  await expect(
    asUser(caregiver, "select configure_communication_rule($1,true,15)", [
      d.id,
    ]),
  ).rejects.toThrow();
  await expect(
    asRole("anon", "select configure_communication_rule($1,true,15)", [d.id]),
  ).rejects.toThrow();
  await expect(
    asRole("service_role", "select configure_communication_rule($1,true,15)", [
      d.id,
    ]),
  ).rejects.toThrow();
  const configured = await configure(d.id);
  expect(configured.rows[0].result).toMatchObject({
    enabled: true,
    timeout_seconds: 15,
    version: 1,
    updated_by: admin,
  });
  for (const role of ["anon", "authenticated", "service_role"] as const)
    await expect(
      asRole(role, "select * from private.communication_rules", [], admin),
    ).rejects.toThrow();
  await pg.query("update profiles set role='caregiver' where id=$1", [admin]);
  await expect(configure(d.id)).rejects.toThrow();
});

it("rejects invalid timeout and batch bounds without side effects", async () => {
  const d = await device();
  for (const timeout of [null, 14, 86401])
    await expect(configure(d.id, true, timeout)).rejects.toThrow();
  await expect(
    asUser(admin, "select configure_communication_rule($1,null,15)", [d.id]),
  ).rejects.toThrow();
  await expect(configure(randomUUID())).rejects.toThrow();
  for (const limit of [null, 0, 1001])
    await expect(evaluate(limit)).rejects.toThrow();
  expect((await configure(d.id, true, 86400)).rows[0].result).toMatchObject({
    version: 1,
    timeout_seconds: 86400,
  });
  for (const user of [admin, caregiver])
    await expect(
      asUser(user, "select evaluate_communication_rules(1)"),
    ).rejects.toThrow();
  await expect(
    asRole("anon", "select evaluate_communication_rules(1)"),
  ).rejects.toThrow();
});

it("does nothing without explicit opt-in and gives newly enabled rules a timeout grace period", async () => {
  const d = await device();
  await pg.query(
    "update devices set last_received_at=clock_timestamp()-interval '1 hour' where id=$1",
    [d.id],
  );
  expect(await evaluate()).toEqual({ checked: 0, emitted: 0, recovered: 0 });
  await configure(d.id, false);
  expect(await evaluate()).toEqual({ checked: 0, emitted: 0, recovered: 0 });
  await configure(d.id);
  expect(await evaluate()).toEqual({ checked: 1, emitted: 0, recovered: 0 });
  expect(await gaps(d.id)).toHaveLength(0);
});

it("emits one warning for a gap even after human resolution and enforces uniqueness", async () => {
  const d = await device();
  await configure(d.id);
  await expire(d.id);
  expect(await evaluate()).toEqual({ checked: 1, emitted: 1, recovered: 0 });
  const [alert] = await gaps(d.id);
  expect(alert).toMatchObject({
    kind: "technical",
    severity: "warning",
    technical_rule: "communication_timeout",
    rule_version: 1,
    assignment_id: d.assignment_id,
    person_id: person,
    source_telemetry_id: null,
    recovered_at: null,
  });
  await asUser(caregiver, "select triage_alert($1,'resolved')", [alert.id]);
  expect(await evaluate()).toEqual({ checked: 1, emitted: 0, recovered: 0 });
  expect(await gaps(d.id)).toHaveLength(1);
  await pg.exec("savepoint duplicate_gap");
  await expect(
    pg.query(
      "insert into alerts(device_id,kind,severity,description,technical_rule,rule_version) values($1,'technical','warning','Duplicate','communication_timeout',1)",
      [d.id],
    ),
  ).rejects.toThrow();
  await pg.exec(
    "rollback to savepoint duplicate_gap; release savepoint duplicate_gap",
  );
  expect(
    (await pg.query("select * from telemetry where device_id=$1", [d.id])).rows,
  ).toHaveLength(0);
});

it("recovers after real new ingestion exactly once while preserving human triage history", async () => {
  const d = await device();
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  const [alert] = await gaps(d.id);
  await asUser(caregiver, "select triage_alert($1,'acknowledged')", [alert.id]);
  expect((await ingest(d)).response).toMatchObject({
    status: 200,
    duplicate: false,
  });
  expect(await evaluate()).toEqual({ checked: 1, emitted: 0, recovered: 1 });
  expect(await evaluate()).toEqual({ checked: 1, emitted: 0, recovered: 0 });
  expect((await gaps(d.id))[0]).toMatchObject({
    status: "resolved",
    triaged_by: caregiver,
    recovered_at: expect.any(Date),
  });
  const history = await pg.query(
    "select status,actor_id,source from alert_status_history where alert_id=$1 order by occurred_at,id",
    [alert.id],
  );
  expect(history.rows).toEqual([
    { status: "new", actor_id: null, source: "system" },
    { status: "acknowledged", actor_id: caregiver, source: "user" },
    { status: "resolved", actor_id: null, source: "system" },
  ]);
});

it("does not recover from a duplicate retry and allows a later distinct gap", async () => {
  const d = await device();
  const accepted = await ingest(d);
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  const before = (
    await pg.query("select last_received_at from devices where id=$1", [d.id])
  ).rows[0];
  expect((await ingest(d, accepted.payload)).response).toMatchObject({
    duplicate: true,
  });
  expect(await evaluate()).toMatchObject({ emitted: 0, recovered: 0 });
  expect(
    (await pg.query("select last_received_at from devices where id=$1", [d.id]))
      .rows[0],
  ).toEqual(before);
  await ingest(d);
  await evaluate();
  await expire(d.id);
  expect(await evaluate()).toMatchObject({ emitted: 1, recovered: 0 });
  expect(await gaps(d.id)).toHaveLength(2);
});

it("versions and audits configuration while retaining the event's original rule version", async () => {
  const d = await device();
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  expect((await configure(d.id, true, 60)).rows[0].result).toMatchObject({
    version: 2,
    timeout_seconds: 60,
    updated_by: admin,
  });
  await evaluate();
  expect((await gaps(d.id))[0]).toMatchObject({ rule_version: 1 });
  const audit = await asUser(
    admin,
    "select actor_id,subject_type,subject_id,details from admin_audit_events where subject_id=$1 and action='communication_rule.configured' order by occurred_at,id",
    [d.id],
  );
  expect(audit.rows).toMatchObject([
    {
      actor_id: admin,
      subject_type: "device",
      subject_id: d.id,
      details: { version: 1, enabled: true, timeout_seconds: 15 },
    },
    {
      actor_id: admin,
      subject_type: "device",
      subject_id: d.id,
      details: { version: 2, enabled: true, timeout_seconds: 60 },
    },
  ]);
});

it("closes a rule-disabled gap as system work without duplicating a human resolved transition", async () => {
  const d = await device();
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  const [alert] = await gaps(d.id);
  await configure(d.id, false);
  expect((await gaps(d.id))[0]).toMatchObject({
    status: "resolved",
    recovered_at: expect.any(Date),
  });
  expect(
    (
      await pg.query(
        "select status,source,actor_id from alert_status_history where alert_id=$1 order by occurred_at,id",
        [alert.id],
      )
    ).rows,
  ).toEqual([
    { status: "new", source: "system", actor_id: null },
    { status: "resolved", source: "system", actor_id: null },
  ]);
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  const second = (await gaps(d.id))[1];
  await asUser(caregiver, "select triage_alert($1,'resolved')", [second.id]);
  await configure(d.id, false);
  expect(
    (
      await pg.query<{ n: number }>(
        "select count(*)::int n from alert_status_history where alert_id=$1",
        [second.id],
      )
    ).rows[0].n,
  ).toBe(2);
  expect(await evaluate()).toEqual({ checked: 0, emitted: 0, recovered: 0 });
});

it("closes prior assignments without restamping and keeps both event and history isolated", async () => {
  const d = await device();
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  const [alert] = await gaps(d.id);
  await asUser(admin, "update devices set person_id=$2 where id=$1", [
    d.id,
    otherPerson,
  ]);
  expect((await gaps(d.id))[0]).toMatchObject({
    person_id: person,
    assignment_id: d.assignment_id,
    status: "resolved",
    recovered_at: expect.any(Date),
  });
  await asUser(
    admin,
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [outsider, d.id],
  );
  for (const user of [caregiver, outsider]) {
    expect(
      (await asUser(user, "select * from alerts where id=$1", [alert.id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await asUser(
          user,
          "select * from alert_status_history where alert_id=$1",
          [alert.id],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(user, "select triage_alert($1,'acknowledged')", [alert.id]),
    ).rejects.toThrow();
  }
  expect(await evaluate()).toMatchObject({ emitted: 0 });
});

it("closes disabled devices immediately and does not emit while disabled", async () => {
  const d = await device();
  await configure(d.id);
  await expire(d.id);
  await evaluate();
  await asUser(admin, "update devices set enabled=false where id=$1", [d.id]);
  expect((await gaps(d.id))[0]).toMatchObject({
    status: "resolved",
    recovered_at: expect.any(Date),
  });
  expect(await evaluate()).toMatchObject({ emitted: 0, recovered: 0 });
});

it("bounds each batch and fairly checks previously unchecked devices first", async () => {
  const devices = [await device(), await device(), await device()];
  for (const d of devices) {
    await configure(d.id);
    await expire(d.id);
  }
  for (let i = 0; i < 3; i++)
    expect(await evaluate(1)).toEqual({ checked: 1, emitted: 1, recovered: 0 });
  expect(
    (
      await pg.query<{ n: number }>(
        "select count(*)::int n from alerts where technical_rule='communication_timeout'",
      )
    ).rows[0].n,
  ).toBe(3);
  expect(await evaluate(2)).toEqual({ checked: 2, emitted: 0, recovered: 0 });
  expect(
    (
      await pg.query(
        "select * from pg_publication_tables where pubname='supabase_realtime' and tablename='communication_rules'",
      )
    ).rows,
  ).toHaveLength(0);
});

it("warns after opt-in silence even when the device has never supplied a reading", async () => {
  const d = await device();
  await configure(d.id);
  await pg.query(
    "update private.communication_rules set monitoring_since=clock_timestamp()-interval '2 minutes' where device_id=$1",
    [d.id],
  );
  expect(await evaluate()).toEqual({ checked: 1, emitted: 1, recovered: 0 });
  expect(
    (
      await pg.query<{ last_received_at: Date | null }>(
        "select last_received_at from devices where id=$1",
        [d.id],
      )
    ).rows[0].last_received_at,
  ).toBeNull();
  expect(
    (await pg.query("select * from telemetry where device_id=$1", [d.id])).rows,
  ).toHaveLength(0);
});

it("preserves firmware event provenance and human transitions with nullable technical metadata", async () => {
  const d = await device();
  await ingest(d, {
    schema_version: 1,
    device_code: d.code,
    message_id: randomUUID(),
    recorded_at: new Date().toISOString(),
    metrics: {},
    event: "device_test",
  });
  const alert = (
    await pg.query<{ id: string }>("select * from alerts where device_id=$1", [
      d.id,
    ])
  ).rows[0];
  expect(alert).toMatchObject({
    kind: "device_test",
    technical_rule: null,
    rule_version: null,
    recovered_at: null,
  });
  await asUser(caregiver, "select triage_alert($1,'acknowledged')", [alert.id]);
  expect(
    (
      await pg.query(
        "select status,source,actor_id from alert_status_history where alert_id=$1 order by occurred_at,id",
        [alert.id],
      )
    ).rows,
  ).toEqual([
    { status: "new", source: "device", actor_id: null },
    { status: "acknowledged", source: "user", actor_id: caregiver },
  ]);
});

it("rejects technical metadata without a rule rather than accepting a nullable CHECK result", async () => {
  const d = await device();
  await pg.exec("savepoint invalid_metadata");
  await expect(
    pg.query(
      "insert into alerts(device_id,kind,description,rule_version) values($1,'technical','Invalid metadata',1)",
      [d.id],
    ),
  ).rejects.toThrow();
  await pg.exec(
    "rollback to savepoint invalid_metadata; release savepoint invalid_metadata",
  );
});
