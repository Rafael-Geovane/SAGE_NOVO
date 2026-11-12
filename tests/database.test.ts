import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const pg = new PGlite();
const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  care: "00000000-0000-4000-8000-000000000002",
  other: "00000000-0000-4000-8000-000000000003",
  person: "00000000-0000-4000-8000-000000000004",
  device: "00000000-0000-4000-8000-000000000005",
  conversation: "00000000-0000-4000-8000-000000000006",
};
beforeAll(async () => {
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await pg.exec(
    readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8"),
  );
  await pg.exec(
    `insert into auth.users values('${ids.admin}','{"role":"admin","display_name":"Admin"}'),('${ids.care}','{"display_name":"Care"}'),('${ids.other}','{"display_name":"Other"}');update public.profiles set role='admin' where id='${ids.admin}';insert into people(id,display_name,consent_recorded_at,consent_recorded_by) values('${ids.person}','Person',now(),'${ids.admin}');insert into devices(id,code,person_id,assigned_at) values('${ids.device}','SGE-001','${ids.person}',now()-interval '1 day');insert into private.device_credentials(device_id,token_hash) values('${ids.device}','${"a".repeat(64)}');`,
  );
  await asUser(
    ids.admin,
    `insert into caregiver_device_links(caregiver_id,device_id) values('${ids.care}','${ids.device}')`,
  );
}, 30000);
afterAll(() => pg.close());
async function asUser(id: string, sql: string) {
  await pg.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
  );
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec("reset role");
  }
}
it("does not promote a signup from editable metadata", async () => {
  const r = await pg.query<{ role: string }>(
    `select role from profiles where id='${ids.other}'`,
  );
  expect(r.rows[0].role).toBe("caregiver");
});
it("enforces linked and unlinked direct SQL access", async () => {
  expect((await asUser(ids.care, "select * from devices")).rows).toHaveLength(
    1,
  );
  expect((await asUser(ids.other, "select * from devices")).rows).toHaveLength(
    0,
  );
  expect((await asUser(ids.other, "select * from people")).rows).toHaveLength(
    0,
  );
  expect((await asUser(ids.admin, "select * from devices")).rows).toHaveLength(
    1,
  );
});
it("denies role escalation and device-credential access", async () => {
  await expect(
    asUser(ids.care, `update profiles set role='admin' where id='${ids.care}'`),
  ).rejects.toThrow();
  await expect(
    asUser(ids.care, "select * from private.device_credentials"),
  ).rejects.toThrow();
  await expect(
    asUser(
      ids.care,
      `insert into caregiver_device_links(caregiver_id,device_id) values('${ids.other}','${ids.device}')`,
    ),
  ).rejects.toThrow();
});
it("authenticates, deduplicates and orders ingestion transactionally", async () => {
  const recorded = new Date().toISOString();
  const p = {
    device_code: "SGE-001",
    schema_version: 1,
    message_id: "11111111-1111-4111-8111-111111111111",
    recorded_at: recorded,
    metrics: { battery_percent: 50 },
    event: "device_test",
  };
  const call = (input: object, hash = "a".repeat(64), limit = 120) =>
    pg.query<{ r: { status: number; duplicate: boolean } }>(
      "select ingest_telemetry($1::jsonb,$2,$3) r",
      [JSON.stringify(input), hash, limit],
    );
  expect((await call(p, "b".repeat(64))).rows[0].r.status).toBe(401);
  expect((await call({ ...p, device_code: "SGE-999" })).rows[0].r.status).toBe(
    401,
  );
  expect((await call(p)).rows[0].r.status).toBe(200);
  expect((await call(p)).rows[0].r.duplicate).toBe(true);
  const old = {
    ...p,
    message_id: "22222222-2222-4222-8222-222222222222",
    recorded_at: new Date(Date.now() - 10000).toISOString(),
    metrics: { battery_percent: 10 },
    event: null,
  };
  await call(old);
  expect(
    (
      await pg.query<{ latest_metrics: { battery_percent: number } }>(
        "select latest_metrics from devices",
      )
    ).rows[0].latest_metrics.battery_percent,
  ).toBe(50);
  expect(
    (await asUser(ids.other, "select * from telemetry")).rows,
  ).toHaveLength(0);
  expect((await asUser(ids.care, "select * from telemetry")).rows).toHaveLength(
    2,
  );
  await expect(
    asUser(
      ids.care,
      `select ingest_telemetry('${JSON.stringify(p)}','${"a".repeat(64)}',120)`,
    ),
  ).rejects.toThrow();
  expect(
    (
      await call(
        { ...old, message_id: "33333333-3333-4333-8333-333333333333" },
        "a".repeat(64),
        2,
      )
    ).rows[0].r.status,
  ).toBe(429);
});
it("isolates conversations and rejects forged authors", async () => {
  const created = await asUser(
    ids.care,
    `insert into support_conversations(subject,client_request_id) values('My question','44444444-4444-4444-8444-444444444444') returning id`,
  );
  ids.conversation = String((created.rows[0] as { id: string }).id);
  await asUser(
    ids.care,
    `insert into support_messages(conversation_id,body,client_message_id) values('${ids.conversation}','Hello','55555555-5555-4555-8555-555555555555')`,
  );
  expect(
    (await asUser(ids.other, "select * from support_messages")).rows,
  ).toHaveLength(0);
  expect(
    (await asUser(ids.admin, "select * from support_messages")).rows,
  ).toHaveLength(1);
  await expect(
    asUser(
      ids.other,
      `insert into support_messages(conversation_id,body,client_message_id) values('${ids.conversation}','Forged','66666666-6666-4666-8666-666666666666')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      ids.care,
      `insert into support_messages(conversation_id,sender_id,body,client_message_id) values('${ids.conversation}','${ids.admin}','Forged','66666666-6666-4666-8666-666666666666')`,
    ),
  ).rejects.toThrow();
});
it("revokes access immediately at the database", async () => {
  await asUser(
    ids.admin,
    `select revoke_caregiver_link(id) from caregiver_device_links where caregiver_id='${ids.care}'`,
  );
  expect((await asUser(ids.care, "select * from telemetry")).rows).toHaveLength(
    0,
  );
  expect((await asUser(ids.care, "select * from devices")).rows).toHaveLength(
    0,
  );
});
it("denies browser telemetry writes even for administrators", async () => {
  for (const user of [ids.care, ids.admin])
    await expect(
      asUser(
        user,
        `insert into telemetry(device_id,message_id,schema_version,recorded_at,metrics) values('${ids.device}',gen_random_uuid(),1,now(),'{}')`,
      ),
    ).rejects.toThrow();
});
it("blocks a disabled device even with its valid token", async () => {
  await pg.exec(`update devices set enabled=false where id='${ids.device}'`);
  const body = {
    device_code: "SGE-001",
    schema_version: 1,
    message_id: "99999999-9999-4999-8999-999999999999",
    recorded_at: new Date().toISOString(),
    metrics: {},
  };
  const result = await pg.query<{ result: { status: number } }>(
    "select ingest_telemetry($1::jsonb,$2,120) result",
    [JSON.stringify(body), "a".repeat(64)],
  );
  expect(result.rows[0].result.status).toBe(403);
  await pg.exec(`update devices set enabled=true where id='${ids.device}'`);
});
it("runs the standalone transactional SQL smoke test", async () => {
  await pg.exec(
    readFileSync(
      new URL("../supabase/tests/access.sql", import.meta.url),
      "utf8",
    ),
  );
  expect(
    (await pg.query("select * from devices where code='SGE-998'")).rows,
  ).toHaveLength(0);
});

it("does not disclose former-person readings on reassignment", async () => {
  await pg.exec(
    `insert into caregiver_device_links(caregiver_id,device_id) values('${ids.care}','${ids.device}');insert into people(id,display_name,consent_recorded_at,consent_recorded_by) values('00000000-0000-4000-8000-000000000099','New person',now(),'${ids.admin}');update devices set person_id='00000000-0000-4000-8000-000000000099' where id='${ids.device}'`,
  );
  expect((await asUser(ids.care, "select * from telemetry")).rows).toHaveLength(
    0,
  );
  expect((await asUser(ids.care, "select * from alerts")).rows).toHaveLength(0);
  const latest = await asUser(ids.care, "select latest_metrics from devices");
  expect(latest.rows).toHaveLength(0);
  await asUser(
    ids.admin,
    `insert into caregiver_device_links(caregiver_id,device_id) values('${ids.care}','${ids.device}')`,
  );
  const newAssignment = await asUser(
    ids.care,
    "select latest_metrics from devices",
  );
  expect(
    (newAssignment.rows[0] as { latest_metrics: unknown }).latest_metrics,
  ).toBeNull();
  expect(
    (await asUser(ids.admin, "select * from telemetry")).rows,
  ).toHaveLength(2);
});
