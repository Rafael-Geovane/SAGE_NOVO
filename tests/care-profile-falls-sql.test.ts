import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
const pg = new PGlite(),
  admin = randomUUID(),
  caregiver = randomUUID(),
  outsider = randomUUID();
let device: { id: string; assignment_id: string };
const data = {
  display_name: "Pessoa de teste",
  address: "Endereço fictício",
  allergy_status: "reported",
  allergies: "Relato fictício",
  health_conditions: "Condição relatada de teste",
  contact_name: null,
  contact_phone: null,
  consent_confirmed: true,
  consent_note: "Autorização fictícia de teste",
};
beforeAll(async () => {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema public,auth to anon,authenticated,service_role;
  grant execute on function auth.uid() to anon,authenticated,service_role;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
  create publication supabase_realtime;`);
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(folder)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(file, folder), "utf8"));
  await pg.query("insert into auth.users values($1,'{}'),($2,'{}'),($3,'{}')", [
    admin,
    caregiver,
    outsider,
  ]);
  await pg.query("update profiles set role='admin' where id=$1", [admin]);
}, 30000);
beforeEach(async () => {
  await pg.exec("begin");
  device = (
    await pg.query<{ id: string; assignment_id: string }>(
      "insert into devices(code) values('SGE-001') returning id,assignment_id",
    )
  ).rows[0];
});
afterEach(() => pg.exec("rollback"));
afterAll(() => pg.close());
async function asUser(
  user: string,
  sql: string,
  args: unknown[] = [],
  role = "authenticated",
) {
  await pg.exec(`set local role ${role}`);
  await pg.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  await pg.exec("savepoint call");
  try {
    const result = await pg.query<Record<string, unknown>>(sql, args);
    await pg.exec("release savepoint call");
    return result;
  } catch (error) {
    await pg.exec("rollback to savepoint call;release savepoint call");
    throw error;
  } finally {
    await pg.exec("reset role");
    await pg.query("select set_config('request.jwt.claim.sub','',true)");
  }
}
async function save(
  values: unknown = data,
  user = admin,
  assignment = device.assignment_id,
) {
  return asUser(
    user,
    "select complete_device_profile($1,$2,$3::jsonb) result",
    [device.id, assignment, JSON.stringify(values)],
  );
}
async function fall() {
  await save();
  const person = (
    await pg.query<{ person_id: string }>(
      "select person_id from devices where id=$1",
      [device.id],
    )
  ).rows[0].person_id;
  await pg.query("select set_config('request.jwt.claim.sub',$1,true)", [admin]);
  await pg.query(
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [caregiver, device.id],
  );
  await pg.query("select set_config('request.jwt.claim.sub','',true)");
  const alert = (
    await pg.query<{ id: string }>(
      "insert into alerts(device_id,kind,severity,description) values($1,'fall_detected','info','Test report') returning id",
      [device.id],
    )
  ).rows[0].id;
  return { person, alert };
}
it("creates the person and assignment atomically without leaking medical content to audit", async () => {
  const result = await save();
  const receipt = result.rows[0].result as {
    person_id: string;
    assignment_id: string;
  };
  expect(receipt.person_id).toBeTruthy();
  expect(receipt.assignment_id).not.toBe(device.assignment_id);
  const person = (
    await pg.query<{ address: string; allergy_status: string }>(
      "select address,allergy_status from people where id=$1",
      [receipt.person_id],
    )
  ).rows[0];
  expect(person).toEqual({ address: data.address, allergy_status: "reported" });
  const audit = await pg.query("select details from admin_audit_events");
  expect(JSON.stringify(audit.rows)).not.toContain(data.address);
  expect(JSON.stringify(audit.rows)).not.toContain(data.allergies);
});
it("denies caregiver/anonymous profile writes and direct health column writes", async () => {
  await expect(save(data, caregiver)).rejects.toThrow();
  await expect(
    asUser(
      "",
      "select complete_device_profile($1,$2,$3)",
      [device.id, device.assignment_id, JSON.stringify(data)],
      "anon",
    ),
  ).rejects.toThrow();
  await save();
  await expect(
    asUser(admin, "update people set address='bypass'"),
  ).rejects.toThrow();
});
it("rejects stale assignment without creating a person", async () => {
  await expect(save(data, admin, randomUUID())).rejects.toThrow(
    "assignment changed",
  );
  expect(
    (
      await pg.query<{ count: number }>(
        "select count(*)::int count from people",
      )
    ).rows[0].count,
  ).toBe(0);
});
it.each([
  { ...data, consent_confirmed: false },
  { ...data, consent_note: "" },
  { ...data, address: "x".repeat(1001) },
  { ...data, allergies: null },
  { ...data, allergy_status: "unknown" },
  { ...data, health_conditions: [] },
  { ...data, extra: "unsupported" },
])("rejects invalid health/consent values transactionally", async (values) => {
  await expect(save(values)).rejects.toThrow();
  expect(
    (
      await pg.query<{ count: number }>(
        "select count(*)::int count from people",
      )
    ).rows[0].count,
  ).toBe(0);
});
it("allows authorized current caregiver to read, denies unrelated account, revokes on link revocation", async () => {
  const { person } = await fall();
  expect(
    (
      await asUser(caregiver, "select address from people where id=$1", [
        person,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(outsider, "select address from people where id=$1", [person]))
      .rows,
  ).toHaveLength(0);
  await pg.query(
    "update caregiver_device_links set revoked_at=clock_timestamp() where caregiver_id=$1",
    [caregiver],
  );
  expect(
    (
      await asUser(caregiver, "select address from people where id=$1", [
        person,
      ])
    ).rows,
  ).toHaveLength(0);
});
it("records human fall review once and audits subsequent correction", async () => {
  const { alert } = await fall();
  await asUser(caregiver, "select review_fall_alert($1,'confirmed')", [alert]);
  await asUser(caregiver, "select review_fall_alert($1,'confirmed')", [alert]);
  let history = (
    await pg.query<{ fall_outcome: string | null; actor_id: string | null }>(
      "select fall_outcome,actor_id from alert_status_history where alert_id=$1 order by id",
      [alert],
    )
  ).rows;
  expect(history).toHaveLength(2);
  expect(history[1]).toMatchObject({
    fall_outcome: "confirmed",
    actor_id: caregiver,
  });
  await asUser(admin, "select review_fall_alert($1,'dismissed')", [alert]);
  history = (
    await pg.query<{ fall_outcome: string | null; actor_id: string | null }>(
      "select fall_outcome,actor_id from alert_status_history where alert_id=$1 order by id",
      [alert],
    )
  ).rows;
  expect(history).toHaveLength(3);
  expect(history[2].fall_outcome).toBe("dismissed");
});
it("denies review after access revocation and unrelated actors", async () => {
  const { alert } = await fall();
  await expect(
    asUser(outsider, "select review_fall_alert($1,'confirmed')", [alert]),
  ).rejects.toThrow();
  await pg.query(
    "update caregiver_device_links set revoked_at=clock_timestamp() where caregiver_id=$1",
    [caregiver],
  );
  await expect(
    asUser(caregiver, "select review_fall_alert($1,'confirmed')", [alert]),
  ).rejects.toThrow();
});
it("preserves consent author/date and existing assignment when editing the same person", async () => {
  const first = (await save()).rows[0].result as {
    person_id: string;
    assignment_id: string;
  };
  const consent = (
    await pg.query(
      "select consent_recorded_at,consent_recorded_by from people where id=$1",
      [first.person_id],
    )
  ).rows[0];
  await save(
    {
      ...data,
      display_name: "Atualizado",
      allergy_status: "unknown",
      allergies: null,
      consent_note: null,
    },
    admin,
    first.assignment_id,
  );
  expect(
    (
      await pg.query(
        "select consent_recorded_at,consent_recorded_by from people where id=$1",
        [first.person_id],
      )
    ).rows[0],
  ).toEqual(consent);
  expect(
    (
      await pg.query<{ assignment_id: string }>(
        "select assignment_id from devices where id=$1",
        [device.id],
      )
    ).rows[0].assignment_id,
  ).toBe(first.assignment_id);
});

it("persists individual care atomically and refuses unreferenced ranges and unauthorized edits", async () => {
  const care = {
    birth_date: "1940-01-01",
    weight_kg: 70,
    height_cm: 170,
    medications: "Nenhum informado",
    professional_reference: "Orientacao ficticia",
    heart_rate_bpm: { min: 60, max: 100 },
    spo2_percent: null,
    temperature_c: null,
  };
  const call = (value: unknown, user = admin) =>
    asUser(user, "select configure_elder_care($1,$2,$3::jsonb)", [
      device.id,
      device.assignment_id,
      JSON.stringify({ ...data, care_settings: value }),
    ]);
  await expect(call(care, outsider)).rejects.toThrow();
  await expect(call({ ...care, professional_reference: "" })).rejects.toThrow();
  await call(care);
  const result = await pg.query<{ care_settings: typeof care }>(
    "select care_settings from people where id=(select person_id from devices where id=$1)",
    [device.id],
  );
  expect(result.rows[0].care_settings.weight_kg).toBe(70);
  await expect(
    call({ ...care, heart_rate_bpm: { min: 110, max: 60 } }),
  ).rejects.toThrow();
  expect(
    (
      await pg.query<{ care_settings: typeof care }>(
        "select care_settings from people where id=(select person_id from devices where id=$1)",
        [device.id],
      )
    ).rows[0].care_settings.heart_rate_bpm.min,
  ).toBe(60);
});

it("claims only unconfigured presentation vests without activation and prevents takeover", async () => {
  await pg.exec(
    "insert into public.devices(code,telemetry_source,requires_esp) values('SGE-005','simulated',false),('SGE-006','simulated',false)",
  );
  const claim = (code: string, user = outsider, role = "authenticated") =>
    asUser(
      user,
      "select public.claim_presentation_device($1) result",
      [code],
      role,
    );
  await expect(claim("SGE-005", outsider, "anon")).rejects.toThrow();
  await expect(claim("SGE-001")).rejects.toThrow();
  const first = await claim("SGE-005");
  expect(
    (first.rows[0].result as { configure_profile: boolean }).configure_profile,
  ).toBe(true);
  await claim("SGE-005");
  await expect(claim("SGE-005", caregiver)).rejects.toThrow();
  await claim("SGE-006", caregiver);
  await expect(claim("SGE-006")).rejects.toThrow();
  const vestId = (first.rows[0].result as { device_id: string }).device_id;
  const managed = await asUser(
    outsider,
    "select public.can_manage_device_profile($1) ok",
    [vestId],
  );
  expect(managed.rows[0].ok).toBe(true);
});
