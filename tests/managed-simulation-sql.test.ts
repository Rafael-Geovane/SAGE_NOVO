import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
const pg = new PGlite(),
  admin = randomUUID(),
  owner = randomUUID(),
  other = randomUUID();
let simulated: { id: string; assignment_id: string },
  physical: { id: string; assignment_id: string };
const profile = {
  display_name: "Pessoa fictícia",
  address: "Rua de teste",
  allergy_status: "unknown",
  allergies: null,
  health_conditions: null,
  contact_name: null,
  contact_phone: null,
  consent_confirmed: true,
  consent_note: "Autorização fictícia no teste isolado",
};
beforeAll(async () => {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on functions to anon,authenticated,service_role;create publication supabase_realtime;`);
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(folder)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(file, folder), "utf8"));
  await pg.query("insert into auth.users values($1,'{}'),($2,'{}'),($3,'{}')", [
    admin,
    owner,
    other,
  ]);
  await pg.query("update profiles set role='admin' where id=$1", [admin]);
}, 30000);
beforeEach(async () => {
  await pg.exec("begin");
  simulated = (
    await pg.query<{ id: string; assignment_id: string }>(
      "insert into devices(code,telemetry_source) values('SGE-067','simulated') returning id,assignment_id",
    )
  ).rows[0];
  physical = (
    await pg.query<{ id: string; assignment_id: string }>(
      "insert into devices(code) values('SGE-001') returning id,assignment_id",
    )
  ).rows[0];
  await pg.query(
    "insert into private.device_profile_managers(device_id,profile_id,assignment_id) values($1,$2,$3)",
    [simulated.id, owner, simulated.assignment_id],
  );
  await pg.query(
    "insert into private.device_credentials(device_id,token_hash) values($1,$2)",
    [simulated.id, "a".repeat(64)],
  );
});
afterEach(() => pg.exec("rollback"));
afterAll(() => pg.close());
async function user(
  id: string,
  sql: string,
  args: unknown[] = [],
  role = "authenticated",
) {
  await pg.exec(`set local role ${role}`);
  await pg.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await pg.exec("savepoint test_call");
  try {
    const r = await pg.query<Record<string, unknown>>(sql, args);
    await pg.exec("release savepoint test_call");
    return r;
  } catch (e) {
    await pg.exec(
      "rollback to savepoint test_call;release savepoint test_call",
    );
    throw e;
  } finally {
    await pg.exec("reset role");
    await pg.query("select set_config('request.jwt.claim.sub','',true)");
  }
}
const save = (
  values: unknown = profile,
  assignment = simulated.assignment_id,
  caller = owner,
) =>
  user(caller, "select complete_device_profile($1,$2,$3::jsonb) result", [
    simulated.id,
    assignment,
    JSON.stringify(values),
  ]);
const emit = (caller = owner, target = simulated, message = randomUUID()) =>
  user(caller, "select emit_simulated_reading($1,$2,$3) result", [
    target.id,
    target.assignment_id,
    message,
  ]);
it("looks up only authorized codes and permits initial setup without fabricating a person", async () => {
  const result = (
    await user(owner, "select lookup_connected_device(' sge-067 ') result")
  ).rows[0].result as { device_id: string; configure_profile: boolean };
  expect(result).toMatchObject({
    device_id: simulated.id,
    configure_profile: true,
  });
  expect(
    (await user(other, "select lookup_connected_device('SGE-067') result"))
      .rows[0].result,
  ).toBeNull();
  expect((await user(owner, "select id from devices")).rows).toEqual([
    { id: simulated.id },
  ]);
  expect(
    (
      await user(
        owner,
        "select device_profile_editable(d) editable from devices d",
      )
    ).rows,
  ).toEqual([{ editable: true }]);
  expect((await pg.query("select id from people")).rows).toHaveLength(0);
});
it("allows the delegated caregiver to complete and edit only the managed person's profile", async () => {
  const first = (await save()).rows[0].result as {
    assignment_id: string;
    person_id: string;
  };
  await save(
    {
      ...profile,
      display_name: "Nome corrigido",
      allergy_status: "reported",
      allergies: "Relato fictício",
    },
    first.assignment_id,
  );
  expect(
    (await user(owner, "select display_name,allergies from people")).rows,
  ).toEqual([{ display_name: "Nome corrigido", allergies: "Relato fictício" }]);
  await expect(
    user(owner, "select complete_device_profile($1,$2,$3::jsonb)", [
      physical.id,
      physical.assignment_id,
      JSON.stringify(profile),
    ]),
  ).rejects.toThrow();
  await expect(save(profile, first.assignment_id, other)).rejects.toThrow();
});
it("does not bypass consent or accept stale setup data", async () => {
  await expect(
    save({ ...profile, consent_confirmed: false }),
  ).rejects.toThrow();
  await expect(save({ ...profile, consent_note: null })).rejects.toThrow();
  await expect(save(profile, randomUUID())).rejects.toThrow();
  expect((await pg.query("select id from people")).rows).toHaveLength(0);
});
it("writes random readings through ingestion with persistent simulated provenance and idempotency", async () => {
  const message = randomUUID();
  expect((await emit(owner, simulated, message)).rows[0].result).toMatchObject({
    status: 200,
    duplicate: false,
  });
  expect((await emit(owner, simulated, message)).rows[0].result).toMatchObject({
    status: 200,
    duplicate: true,
  });
  const rows = (
    await pg.query<{ source: string; metrics: Record<string, number> }>(
      "select source,metrics from telemetry",
    )
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].source).toBe("simulated");
  expect(rows[0].metrics.battery_percent).toBeGreaterThanOrEqual(30);
  expect((await user(owner, "select source from telemetry")).rows).toEqual([
    { source: "simulated" },
  ]);
  expect((await pg.query("select id from alerts")).rows).toHaveLength(0);
});
it("rejects anonymous, unrelated caller and writes to a physical vest", async () => {
  await expect(emit(other)).rejects.toThrow();
  await expect(emit(admin, physical)).rejects.toThrow();
  await expect(
    user(
      "",
      "select emit_simulated_reading($1,$2,$3)",
      [simulated.id, simulated.assignment_id, randomUUID()],
      "anon",
    ),
  ).rejects.toThrow();
  await expect(
    user(owner, "update devices set telemetry_source='device' where id=$1", [
      simulated.id,
    ]),
  ).rejects.toThrow();
  await expect(
    user(owner, "select * from private.device_profile_managers"),
  ).rejects.toThrow();
  expect((await pg.query("select id from telemetry")).rows).toHaveLength(0);
});
it("revokes access and generation on reassignment outside the delegated setup flow", async () => {
  await save();
  await pg.query("update devices set person_id=null where id=$1", [
    simulated.id,
  ]);
  expect((await user(owner, "select id from devices")).rows).toHaveLength(0);
  await expect(emit()).rejects.toThrow();
  await expect(save()).rejects.toThrow();
});
it("stops when disabled or its credential is revoked", async () => {
  await pg.query(
    "update private.device_credentials set revoked_at=clock_timestamp() where device_id=$1",
    [simulated.id],
  );
  expect((await emit()).rows[0].result).toMatchObject({ status: 401 });
  await pg.query("update devices set enabled=false where id=$1", [
    simulated.id,
  ]);
  await expect(emit()).rejects.toThrow();
  expect((await pg.query("select id from telemetry")).rows).toHaveLength(0);
});
it("keeps demo readings stable and persists an explicit simulated fall exactly once", async () => {
  const saved = (await save()).rows[0].result as { assignment_id: string };
  simulated.assignment_id = saved.assignment_id;
  await emit();
  const normal = (
    await pg.query<{ metrics: Record<string, number> }>(
      "select metrics from telemetry order by id desc limit 1",
    )
  ).rows[0].metrics;
  expect(normal.temperature_c).toBe(36.5);
  expect(normal.heart_rate_bpm).toBeGreaterThanOrEqual(70);
  expect(normal.heart_rate_bpm).toBeLessThanOrEqual(76);
  expect(normal.spo2_percent).toBeGreaterThanOrEqual(97);
  expect(normal.battery_percent).toBe(85);
  const message = randomUUID();
  const args = [simulated.id, simulated.assignment_id, message, "fall"];
  await user(owner, "select emit_simulated_reading($1,$2,$3,$4)", args);
  await user(owner, "select emit_simulated_reading($1,$2,$3,$4)", args);
  expect((await pg.query("select kind,source from alerts")).rows).toEqual([
    { kind: "fall_detected", source: "simulated" },
  ]);
  await expect(
    user(other, "select emit_simulated_reading($1,$2,$3,$4)", [
      simulated.id,
      simulated.assignment_id,
      randomUUID(),
      "fall",
    ]),
  ).rejects.toThrow();
  await expect(
    user(admin, "select emit_simulated_reading($1,$2,$3,$4)", [
      physical.id,
      physical.assignment_id,
      randomUUID(),
      "fall",
    ]),
  ).rejects.toThrow();
  await expect(
    user(owner, "select emit_simulated_reading($1,$2,$3,$4)", [
      simulated.id,
      simulated.assignment_id,
      randomUUID(),
      "unknown",
    ]),
  ).rejects.toThrow();
});
it("supports extra scenarios, preserves null sensors and refuses conflicting retries", async () => {
  for (const scenario of [
    "rest",
    "movement",
    "high-pulse",
    "low-oxygen",
    "partial",
    "device-test",
    "recovery",
  ]) {
    const message = randomUUID();
    const args = [simulated.id, simulated.assignment_id, message, scenario];
    await user(owner, "select emit_simulated_reading($1,$2,$3,$4)", args);
    await user(owner, "select emit_simulated_reading($1,$2,$3,$4)", args);
    await expect(
      user(owner, "select emit_simulated_reading($1,$2,$3,$4)", [
        simulated.id,
        simulated.assignment_id,
        message,
        "normal",
      ]),
    ).rejects.toThrow();
  }
  const rows = (
    await pg.query<{ metrics: Record<string, unknown>; event: string | null }>(
      "select metrics,event from telemetry order by id",
    )
  ).rows;
  expect(rows).toHaveLength(7);
  expect(rows.every((row) => row.metrics.temperature_c === 36.5)).toBe(true);
  expect(rows[4].metrics.heart_rate_bpm).toBeNull();
  expect(rows[5].event).toBe("device_test");
});
it("aggregates authorized weeks and enforces demo plan benefits on the server", async () => {
  const args = [
    simulated.id,
    simulated.assignment_id,
    new Date().toISOString().slice(0, 10),
  ];
  await emit();
  const r = (
    await user(
      owner,
      "select weekly_device_report($1,$2,$3::date) result",
      args,
    )
  ).rows[0].result as {
    sources: { samples: number }[];
    metrics: { metric: string; mean: number }[];
  };
  expect(r.sources[0].samples).toBe(1);
  expect(r.metrics.find((m) => m.metric === "temperature_c")?.mean).toBe(36.5);
  await expect(
    user(other, "select weekly_device_report($1,$2,$3::date)", args),
  ).rejects.toThrow();
  await expect(
    user(owner, "select export_weekly_report($1,$2,$3::date)", args),
  ).rejects.toThrow();
  await expect(
    user(owner, "select demo_weekly_analysis($1,$2,$3::date)", args),
  ).rejects.toThrow();
  await user(owner, "select select_demo_plan('plus')");
  await user(owner, "select export_weekly_report($1,$2,$3::date)", args);
  await expect(
    user(owner, "select demo_weekly_analysis($1,$2,$3::date)", args),
  ).rejects.toThrow();
  await user(owner, "select select_demo_plan('premium')");
  const analysis = (
    await user(
      owner,
      "select demo_weekly_analysis($1,$2,$3::date) result",
      args,
    )
  ).rows[0].result as { mode: string; paragraphs: string[] };
  expect(analysis.mode).toBe("demo_rules");
  expect(analysis.paragraphs).toHaveLength(4);
  for (let i = 0; i < 3; i++)
    expect(
      (
        await user(owner, "select reserve_weekly_ai_request($1,$2) allowed", [
          simulated.id,
          simulated.assignment_id,
        ])
      ).rows[0].allowed,
    ).toBe(true);
  expect(
    (
      await user(owner, "select reserve_weekly_ai_request($1,$2) allowed", [
        simulated.id,
        simulated.assignment_id,
      ])
    ).rows[0].allowed,
  ).toBe(false);
  await expect(
    user(other, "select reserve_weekly_ai_request($1,$2)", [
      simulated.id,
      simulated.assignment_id,
    ]),
  ).rejects.toThrow();
  await expect(
    user(other, "select demo_weekly_analysis($1,$2,$3::date)", args),
  ).rejects.toThrow();
  expect(
    (await user(other, "select * from demo_subscriptions")).rows,
  ).toHaveLength(0);
  await user(owner, "select select_demo_plan('essential')");
  await expect(
    user(owner, "select demo_weekly_analysis($1,$2,$3::date)", args),
  ).rejects.toThrow();
  await expect(
    user(owner, "update demo_subscriptions set plan='premium'"),
  ).rejects.toThrow();
});
