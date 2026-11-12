import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const pg = new PGlite();
const admin = randomUUID();
const caregiver = randomUUID();
const stranger = randomUUID();
const person = randomUUID();
const otherPerson = randomUUID();
const hash = "a".repeat(64);
let nextCode = 600;

const bootstrap = `
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
  `;
beforeAll(async () => {
  await pg.exec(bootstrap);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
  await pg.query<Record<string, unknown>>(
    "insert into auth.users values($1,'{}'),($2,'{}'),($3,'{}')",
    [admin, caregiver, stranger],
  );
  await pg.query<Record<string, unknown>>(
    "update profiles set role='admin' where id=$1",
    [admin],
  );
  await pg.query<Record<string, unknown>>(
    "insert into people(id,display_name,consent_recorded_at,consent_recorded_by) values($1,'Person A',now(),$3),($2,'Person B',now(),$3)",
    [person, otherPerson, admin],
  );
}, 30000);
afterAll(() => pg.close());

async function asRole(
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
  user = "",
) {
  await pg.exec(`set role ${role}`);
  await pg.query<Record<string, unknown>>(
    "select set_config('request.jwt.claim.sub',$1,false)",
    [user],
  );
  try {
    return await pg.query<Record<string, unknown>>(sql, params);
  } finally {
    await pg.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false)",
    );
  }
}
const asUser = (user: string, sql: string, params: unknown[] = []) =>
  asRole("authenticated", sql, params, user);
async function device() {
  const code = `SGE-${nextCode++}`;
  const result = await pg.query<{ id: string; assignment_id: string }>(
    "insert into devices(code,person_id,assigned_at) values($1,$2,now()-interval '1 day') returning id,assignment_id",
    [code, person],
  );
  const row = { ...result.rows[0], code };
  await pg.query<Record<string, unknown>>(
    "insert into private.device_credentials(device_id,token_hash) values($1,$2)",
    [row.id, hash.slice(0, 60) + nextCode.toString(16).padStart(4, "0")],
  );
  await asUser(
    admin,
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [caregiver, row.id],
  );
  return row;
}
function payload(code: string, changes: Record<string, unknown> = {}) {
  return {
    device_code: code,
    schema_version: 1,
    message_id: randomUUID(),
    recorded_at: new Date().toISOString(),
    metrics: { battery_percent: 50 },
    event: "device_test",
    ...changes,
  };
}
async function ingest(input: object, tokenHash?: string, limit = 120) {
  if (!tokenHash) {
    const credential = await pg.query<{ token_hash: string }>(
      "select token_hash from private.device_credentials where device_id=(select id from devices where code=$1)",
      [(input as { device_code: string }).device_code],
    );
    tokenHash = credential.rows[0]?.token_hash ?? hash;
  }
  const result = await asRole(
    "service_role",
    "select ingest_telemetry($1::jsonb,$2,$3) result",
    [JSON.stringify(input), tokenHash, limit],
  );
  return result.rows[0].result as {
    status: number;
    error?: string;
    duplicate?: boolean;
  };
}

it("preserves exact retry idempotency and rejects message-ID payload conflicts without effects", async () => {
  const d = await device();
  const first = payload(d.code, {
    metrics: { battery_percent: 50, gyroscope: null },
  });
  expect((await ingest(first)).status).toBe(200);
  expect(
    (
      await ingest({
        ...first,
        recorded_at: first.recorded_at.replace("Z", "+00:00"),
      })
    ).duplicate,
  ).toBe(true);
  expect(
    await ingest({ ...first, metrics: { battery_percent: 99 } }),
  ).toMatchObject({ status: 409, error: "idempotency_conflict" });
  const rows = await pg.query<Record<string, unknown>>(
    "select (select count(*)::int from telemetry where device_id=$1) readings,(select count(*)::int from alerts where device_id=$1) alerts,(select window_count from private.device_credentials where device_id=$1) rate_count",
    [d.id],
  );
  expect(rows.rows[0]).toEqual({ readings: 1, alerts: 1, rate_count: 1 });
});

it("validates privileged SQL ingestion and rolls back rejected readings", async () => {
  const d = await device();
  const valid = payload(d.code);
  for (const changes of [
    { schema_version: null },
    { schema_version: "1" },
    { message_id: "bad" },
    { recorded_at: "infinity" },
    { recorded_at: null },
    { metrics: null },
    { metrics: { battery_percent: 101 } },
    { metrics: { spo2_percent: "95" } },
    { metrics: { heart_rate_bpm: -1 } },
    { metrics: { unsupported: true } },
    { metrics: { gyroscope: { x: 1, y: 2, z: 3, unit: "wrong" } } },
    { event: "invented" },
  ])
    expect(await ingest({ ...valid, ...changes })).toMatchObject({
      status: 400,
      error: "invalid_payload",
    });
  expect(
    await ingest({
      ...valid,
      recorded_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    }),
  ).toMatchObject({ status: 400, error: "reading_predates_assignment" });
  expect(
    (
      await pg.query<Record<string, unknown>>(
        "select * from telemetry where device_id=$1",
        [d.id],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await pg.query<Record<string, unknown>>(
        "select window_count from private.device_credentials where device_id=$1",
        [d.id],
      )
    ).rows[0].window_count,
  ).toBe(0);
});

it("keeps latest metrics deterministic for tied and out-of-order device timestamps", async () => {
  const d = await device();
  const first = payload(d.code, { event: null });
  await ingest(first);
  await ingest({
    ...first,
    message_id: randomUUID(),
    metrics: { battery_percent: 60 },
  });
  await ingest({
    ...first,
    message_id: randomUUID(),
    recorded_at: new Date(Date.parse(first.recorded_at) - 1000).toISOString(),
    metrics: { battery_percent: 5 },
  });
  const latest = await pg.query<Record<string, unknown>>(
    "select latest_metrics,latest_recorded_at from devices where id=$1",
    [d.id],
  );
  expect(latest.rows[0].latest_metrics).toEqual({ battery_percent: 60 });
  const readings = await asUser(
    caregiver,
    "select metrics from telemetry where device_id=$1 order by recorded_at desc,id desc",
    [d.id],
  );
  expect(readings.rows.map((row) => row.metrics)).toEqual([
    { battery_percent: 60 },
    { battery_percent: 50 },
    { battery_percent: 5 },
  ]);
});

it("pages an authorized assignment within an inclusive time range with a stable tie order", async () => {
  const d = await device();
  const from = new Date(Date.now() - 30000).toISOString();
  const to = new Date(Date.now() - 10000).toISOString();
  for (const [recorded_at, battery_percent] of [
    [new Date(Date.parse(from) - 1).toISOString(), 1],
    [from, 20],
    [to, 30],
    [to, 40],
    [new Date(Date.parse(to) + 1).toISOString(), 99],
  ] as const)
    await ingest(
      payload(d.code, {
        recorded_at,
        metrics: { battery_percent },
        event: null,
      }),
    );
  const sql =
    "select metrics from telemetry where device_id=$1 and assignment_id=$2 and recorded_at>=$3 and recorded_at<=$4 order by recorded_at desc,id desc limit 2 offset $5";
  const page1 = await asUser(caregiver, sql, [
    d.id,
    d.assignment_id,
    from,
    to,
    0,
  ]);
  const page2 = await asUser(caregiver, sql, [
    d.id,
    d.assignment_id,
    from,
    to,
    2,
  ]);
  expect(page1.rows.map((row) => row.metrics)).toEqual([
    { battery_percent: 40 },
    { battery_percent: 30 },
  ]);
  expect(page2.rows.map((row) => row.metrics)).toEqual([
    { battery_percent: 20 },
  ]);
  expect(
    (await asUser(stranger, sql, [d.id, d.assignment_id, from, to, 0])).rows,
  ).toHaveLength(0);
});

it("rolls back telemetry, latest state and quota if alert creation fails", async () => {
  const d = await device();
  await pg.exec(`create function private.fail_test_alert() returns trigger language plpgsql as $$begin raise exception 'simulated downstream failure';end$$;
    create trigger fail_test_alert after insert on alerts for each row execute function private.fail_test_alert();`);
  try {
    await expect(ingest(payload(d.code))).rejects.toThrow(
      "simulated downstream failure",
    );
    expect(
      (
        await pg.query<Record<string, unknown>>(
          "select count(*)::int n from telemetry where device_id=$1",
          [d.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pg.query<Record<string, unknown>>(
          "select count(*)::int n from alerts where device_id=$1",
          [d.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pg.query<Record<string, unknown>>(
          "select latest_metrics,last_received_at from devices where id=$1",
          [d.id],
        )
      ).rows[0],
    ).toEqual({ latest_metrics: null, last_received_at: null });
    expect(
      (
        await pg.query<Record<string, unknown>>(
          "select window_count from private.device_credentials where device_id=$1",
          [d.id],
        )
      ).rows[0].window_count,
    ).toBe(0);
  } finally {
    await pg.exec(
      "drop trigger fail_test_alert on alerts;drop function private.fail_test_alert()",
    );
  }
});

it("revokes old assignment links and never re-exposes history after A to B to A", async () => {
  const d = await device();
  const original = payload(d.code);
  await ingest(original);
  await asUser(admin, "update devices set person_id=$2 where id=$1", [
    d.id,
    otherPerson,
  ]);
  expect(
    (await asUser(caregiver, "select * from devices where id=$1", [d.id])).rows,
  ).toHaveLength(0);
  await expect(
    asUser(
      admin,
      "update caregiver_device_links set revoked_at=null where device_id=$1",
      [d.id],
    ),
  ).rejects.toThrow();
  await asUser(
    admin,
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [caregiver, d.id],
  );
  await asUser(admin, "update devices set person_id=$2 where id=$1", [
    d.id,
    person,
  ]);
  await asUser(
    admin,
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [caregiver, d.id],
  );
  for (const table of ["telemetry", "alerts", "alert_status_history"])
    expect(
      (
        await asUser(caregiver, `select * from ${table} where device_id=$1`, [
          d.id,
        ])
      ).rows,
    ).toHaveLength(0);
  const current = await asUser(
    caregiver,
    "select assignment_id,latest_metrics from devices where id=$1",
    [d.id],
  );
  expect(current.rows[0].assignment_id).not.toBe(d.assignment_id);
  expect(current.rows[0].latest_metrics).toBeNull();
  expect((await ingest(original)).duplicate).toBe(true);
  expect(
    (
      await asUser(
        caregiver,
        "select latest_metrics from devices where id=$1",
        [d.id],
      )
    ).rows[0].latest_metrics,
  ).toBeNull();
  expect(
    (await asUser(admin, "select * from telemetry where device_id=$1", [d.id]))
      .rows,
  ).toHaveLength(1);
});

it("records immutable alert provenance and authorized state transitions", async () => {
  const d = await device();
  await ingest(payload(d.code, { event: "fall_detected" }));
  const alert = (
    await asUser(caregiver, "select * from alerts where device_id=$1", [d.id])
  ).rows[0];
  expect(alert.source_telemetry_id).toBeTruthy();
  await expect(
    asUser(stranger, "select triage_alert($1,'acknowledged')", [alert.id]),
  ).rejects.toThrow();
  await asUser(caregiver, "select triage_alert($1,'acknowledged')", [alert.id]);
  await asUser(caregiver, "select triage_alert($1,'acknowledged')", [alert.id]);
  await asUser(admin, "select triage_alert($1,'resolved')", [alert.id]);
  await asUser(caregiver, "select triage_alert($1,'new')", [alert.id]);
  const history = await asUser(
    caregiver,
    "select previous_status,status,actor_id,source from alert_status_history where alert_id=$1 order by occurred_at,id",
    [alert.id],
  );
  expect(history.rows).toEqual([
    { previous_status: null, status: "new", actor_id: null, source: "device" },
    {
      previous_status: "new",
      status: "acknowledged",
      actor_id: caregiver,
      source: "user",
    },
    {
      previous_status: "acknowledged",
      status: "resolved",
      actor_id: admin,
      source: "user",
    },
    {
      previous_status: "resolved",
      status: "new",
      actor_id: caregiver,
      source: "user",
    },
  ]);
  await expect(
    asUser(admin, "delete from alert_status_history where alert_id=$1", [
      alert.id,
    ]),
  ).rejects.toThrow();
  expect(
    (
      await asUser(
        stranger,
        "select * from alert_status_history where device_id=$1",
        [d.id],
      )
    ).rows,
  ).toHaveLength(0);
});

it("rotates and revokes device credentials through service-only audited functions", async () => {
  const d = await device();
  const oldHash = (
    await pg.query<Record<string, unknown>>(
      "select token_hash from private.device_credentials where device_id=$1",
      [d.id],
    )
  ).rows[0].token_hash as string;
  const replacement = "b".repeat(64);
  await expect(
    asUser(admin, "select rotate_device_credential($1,$2,$3)", [
      d.id,
      replacement,
      admin,
    ]),
  ).rejects.toThrow();
  await expect(
    asRole("service_role", "select rotate_device_credential($1,$2,$3)", [
      d.id,
      replacement,
      caregiver,
    ]),
  ).rejects.toThrow();
  const rotated = await asRole(
    "service_role",
    "select rotate_device_credential($1,$2,$3,'scheduled replacement') result",
    [d.id, replacement, admin],
  );
  expect(rotated.rows[0].result).toMatchObject({
    device_id: d.id,
    version: 2,
    revoked_at: null,
  });
  expect((await ingest(payload(d.code), oldHash)).status).toBe(401);
  expect((await ingest(payload(d.code), replacement)).status).toBe(200);
  await asRole(
    "service_role",
    "select revoke_device_credential($1,$2,'device retired')",
    [d.id, admin],
  );
  expect((await ingest(payload(d.code), replacement)).status).toBe(401);
  const audit = await asUser(
    admin,
    "select action,actor_id,details from admin_audit_events where subject_id=$1 and action like 'credential.%' order by occurred_at,id",
    [d.id],
  );
  expect(audit.rows.map((row) => row.action)).toEqual([
    "credential.rotated",
    "credential.revoked",
  ]);
  expect(audit.rows.every((row) => row.actor_id === admin)).toBe(true);
  expect(JSON.stringify(audit.rows)).not.toContain(replacement);
  expect(JSON.stringify(audit.rows)).not.toContain(oldHash);
  expect(
    (await asUser(caregiver, "select * from admin_audit_events")).rows,
  ).toHaveLength(0);
});

it("computes a bounded, administrator-only dashboard consistently", async () => {
  const d = await device();
  await ingest(payload(d.code));
  await asUser(admin, "update devices set enabled=false where id=$1", [d.id]);
  await expect(asUser(caregiver, "select admin_dashboard()")).rejects.toThrow();
  await expect(asUser(admin, "select admin_dashboard(0,15)")).rejects.toThrow();
  const result = await asUser(admin, "select admin_dashboard(24,15) result");
  const dashboard = result.rows[0].result as Record<string, unknown>;
  const expected = (
    await pg.query<Record<string, unknown>>(
      "select (select count(*)::int from devices) devices,(select count(*)::int from devices where enabled and last_received_at>=now()-interval '15 seconds') recent_devices,(select count(*)::int from telemetry where received_at>=now()-interval '24 hours') recent_readings",
    )
  ).rows[0];
  expect(dashboard).toMatchObject(expected);
  expect(dashboard.generated_at).toBeTruthy();
});

it("denies anonymous access and direct browser writes to realtime source and audit tables", async () => {
  const d = await device();
  await ingest(payload(d.code));
  for (const table of [
    "devices",
    "telemetry",
    "alerts",
    "caregiver_device_links",
    "alert_status_history",
    "admin_audit_events",
  ])
    await expect(asRole("anon", `select * from ${table}`)).rejects.toThrow();
  for (const user of [caregiver, admin]) {
    await expect(
      asUser(user, "select ingest_telemetry('{}',$1,120)", [hash]),
    ).rejects.toThrow();
    await expect(
      asUser(
        user,
        "update devices set assignment_id=gen_random_uuid() where id=$1",
        [d.id],
      ),
    ).rejects.toThrow();
    await expect(
      asUser(user, "update alerts set status='resolved' where device_id=$1", [
        d.id,
      ]),
    ).rejects.toThrow();
    await expect(
      asUser(user, "select * from private.device_credentials"),
    ).rejects.toThrow();
  }
  await expect(asRole("anon", "select admin_dashboard()")).rejects.toThrow();
  await expect(asRole("anon", "select touch_activity()")).rejects.toThrow();
  await expect(
    asRole("anon", "select triage_alert(gen_random_uuid(),'resolved')"),
  ).rejects.toThrow();
  await asUser(
    admin,
    "update people set consent_recorded_at=null,consent_recorded_by=null where id=$1",
    [person],
  );
  for (const table of [
    "devices",
    "telemetry",
    "alerts",
    "alert_status_history",
  ])
    expect(
      (
        await asUser(
          caregiver,
          `select * from ${table} where ${table === "devices" ? "id" : "device_id"}=$1`,
          [d.id],
        )
      ).rows,
    ).toHaveLength(0);
});

it("publishes only intended realtime source tables while retaining row security", async () => {
  const sources = await pg.query<{ tablename: string; row_security: boolean }>(
    "select p.tablename,c.relrowsecurity row_security from pg_publication_tables p join pg_namespace n on n.nspname=p.schemaname join pg_class c on c.relnamespace=n.oid and c.relname=p.tablename where p.pubname='supabase_realtime' order by p.tablename",
  );
  expect(sources.rows.map((row) => row.tablename)).toEqual([
    "alert_status_history",
    "alerts",
    "caregiver_device_links",
    "devices",
    "telemetry",
  ]);
  expect(sources.rows.every((row) => row.row_security)).toBe(true);
});

it("upgrades existing data without changing identity, readings, credentials or alert state", async () => {
  const legacy = new PGlite();
  const migrationName = "202610190002_backend_integrity.sql";
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  const deviceId = randomUUID();
  const messageId = randomUUID();
  const alertId = randomUUID();
  try {
    await legacy.exec(bootstrap);
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith(".sql") && name < migrationName)
      .sort())
      await legacy.exec(readFileSync(new URL(file, migrations), "utf8"));
    await legacy.query(
      "insert into auth.users values($1,'{\"display_name\":\"Existing admin\"}'),($2,'{}')",
      [admin, caregiver],
    );
    await legacy.query("update profiles set role='admin' where id=$1", [admin]);
    await legacy.query(
      "insert into people(id,display_name,consent_recorded_at,consent_recorded_by) values($1,'Existing person',now(),$2)",
      [person, admin],
    );
    await legacy.query(
      "insert into devices(id,code,person_id,assigned_at) values($1,'SGE-999',$2,now()-interval '1 day')",
      [deviceId, person],
    );
    await legacy.query(
      "insert into private.device_credentials(device_id,token_hash,window_count) values($1,$2,12)",
      [deviceId, hash],
    );
    await legacy.query(
      "insert into telemetry(device_id,message_id,schema_version,recorded_at,metrics) values($1,$2,1,now()-interval '1 hour','{\"battery_percent\":42}')",
      [deviceId, messageId],
    );
    await legacy.query(
      "insert into alerts(id,device_id,kind,description,status,triaged_by,triaged_at,created_at) values($1,$2,'device_test','Existing alert','acknowledged',$3,now()-interval '5 minutes',now()-interval '1 hour')",
      [alertId, deviceId, caregiver],
    );
    await legacy.exec(readFileSync(new URL(migrationName, migrations), "utf8"));
    expect(
      (
        await legacy.query(
          "select display_name,role from profiles where id=$1",
          [admin],
        )
      ).rows[0],
    ).toEqual({ display_name: "Existing admin", role: "admin" });
    expect(
      (
        await legacy.query(
          "select message_id,metrics from telemetry where device_id=$1",
          [deviceId],
        )
      ).rows[0],
    ).toEqual({ message_id: messageId, metrics: { battery_percent: 42 } });
    expect(
      (
        await legacy.query(
          "select token_hash,window_count,version,revoked_at from private.device_credentials where device_id=$1",
          [deviceId],
        )
      ).rows[0],
    ).toEqual({
      token_hash: hash,
      window_count: 12,
      version: 1,
      revoked_at: null,
    });
    expect(
      (
        await legacy.query(
          "select status,triaged_by,source_telemetry_id from alerts where id=$1",
          [alertId],
        )
      ).rows[0],
    ).toEqual({
      status: "acknowledged",
      triaged_by: caregiver,
      source_telemetry_id: null,
    });
    expect(
      (
        await legacy.query(
          "select previous_status,status,actor_id,source from alert_status_history where alert_id=$1",
          [alertId],
        )
      ).rows[0],
    ).toEqual({
      previous_status: null,
      status: "acknowledged",
      actor_id: null,
      source: "legacy",
    });
    expect(
      (
        await legacy.query(
          "select t.assignment_id=d.assignment_id matches from telemetry t join devices d on d.id=t.device_id where d.id=$1",
          [deviceId],
        )
      ).rows[0],
    ).toEqual({ matches: true });
  } finally {
    await legacy.close();
  }
}, 30000);
