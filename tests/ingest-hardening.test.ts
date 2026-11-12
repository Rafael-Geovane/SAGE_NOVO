import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";

const pg = new PGlite();
const admin = randomUUID(),
  caregiver = randomUUID(),
  person = randomUUID(),
  device = randomUUID();
const hash = "a".repeat(64);
let link: string;
beforeAll(async () => {
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const root = new URL("../supabase/migrations/", import.meta.url);
  for (const name of readdirSync(root)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(name, root), "utf8"));
  await pg.query("insert into auth.users values($1,'{}'),($2,'{}')", [
    admin,
    caregiver,
  ]);
  await pg.query("update profiles set role='admin' where id=$1", [admin]);
  await pg.query(
    "insert into people(id,display_name,consent_recorded_at,consent_recorded_by) values($1,'Test person',now(),$2)",
    [person, admin],
  );
  await pg.query(
    "insert into devices(id,code,person_id,assigned_at) values($1,'SGE-800',$2,now()-interval '1 day')",
    [device, person],
  );
  await pg.query(
    "insert into private.device_credentials(device_id,token_hash) values($1,$2)",
    [device, hash],
  );
  await user(
    admin,
    "insert into caregiver_device_links(caregiver_id,device_id) values($1,$2)",
    [caregiver, device],
  );
  link = (
    await pg.query<{ id: string }>(
      "select id from caregiver_device_links where device_id=$1",
      [device],
    )
  ).rows[0].id;
}, 30000);
afterAll(() => pg.close());

async function user(id: string, sql: string, params: unknown[] = []) {
  await pg.exec("set role authenticated");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try {
    return await pg.query(sql, params);
  } finally {
    await pg.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false)",
    );
  }
}

it("authenticates before entering the locked implementation and revalidates inside it", async () => {
  const payload = {
    schema_version: 1,
    device_code: "SGE-800",
    message_id: randomUUID(),
    recorded_at: new Date().toISOString(),
    metrics: {},
  };
  await pg.exec("begin");
  try {
    await pg.exec(
      `create or replace function private.ingest_telemetry(p_payload jsonb,p_token_hash text,p_limit integer default 120) returns jsonb language plpgsql as $$begin raise exception 'locked implementation entered'; end;$$;`,
    );
    const invalid = await pg.query<{ r: { status: number } }>(
      "select public.ingest_telemetry($1,$2,120) r",
      [payload, "b".repeat(64)],
    );
    expect(invalid.rows[0].r.status).toBe(401);
    await expect(
      pg.query("select public.ingest_telemetry($1,$2,120)", [payload, hash]),
    ).rejects.toThrow("locked implementation entered");
  } finally {
    await pg.exec("rollback");
  }
  const valid = await pg.query<{ r: { status: number } }>(
    "select public.ingest_telemetry($1,$2,120) r",
    [payload, hash],
  );
  expect(valid.rows[0].r.status).toBe(200);
  await pg.query(
    "update private.device_credentials set revoked_at=now() where device_id=$1",
    [device],
  );
  const revoked = await pg.query<{ r: { status: number } }>(
    "select public.ingest_telemetry($1,$2,120) r",
    [payload, hash],
  );
  expect(revoked.rows[0].r.status).toBe(401);
});

it("denies direct link updates even to an administrator", async () => {
  await expect(
    user(
      admin,
      "update caregiver_device_links set revoked_at=now() where id=$1",
      [link],
    ),
  ).rejects.toThrow();
});

it("uses the same device-first lock order for human triage and technical recovery", async () => {
  const result = await pg.query<{ definition: string }>(
    "select pg_get_functiondef('public.triage_alert(uuid,text)'::regprocedure) as definition",
  );
  expect(result.rows[0].definition).toMatch(
    /perform[\s\S]*from public\.devices[\s\S]*for update;[\s\S]*select \* into a from public\.alerts[\s\S]*for update;/i,
  );
});

it("revokes through an admin-only device-first RPC, once, with audit", async () => {
  await expect(
    user(caregiver, "select revoke_caregiver_link($1)", [link]),
  ).rejects.toThrow();
  await pg.exec("set role anon");
  try {
    await expect(
      pg.query("select revoke_caregiver_link($1)", [link]),
    ).rejects.toThrow();
  } finally {
    await pg.exec("reset role");
  }
  await user(admin, "select revoke_caregiver_link($1)", [link]);
  await user(admin, "select revoke_caregiver_link($1)", [link]);
  expect(
    (await user(caregiver, "select id from devices where id=$1", [device]))
      .rows,
  ).toHaveLength(0);
  const audit = await pg.query<{ actor_id: string }>(
    "select actor_id from admin_audit_events where subject_id=$1 and action='caregiver_link.revoked'",
    [link],
  );
  expect(audit.rows).toEqual([{ actor_id: admin }]);
});

it("keeps the locked ingest implementation inaccessible through all API roles", async () => {
  const result = await pg.query<{
    safe: boolean;
  }>(`select not has_function_privilege('anon','public.ingest_telemetry(jsonb,text,integer)','execute')
    and not has_function_privilege('authenticated','public.ingest_telemetry(jsonb,text,integer)','execute')
    and has_function_privilege('service_role','public.ingest_telemetry(jsonb,text,integer)','execute')
    and not has_function_privilege('service_role','private.ingest_telemetry(jsonb,text,integer)','execute') as safe`);
  expect(result.rows[0].safe).toBe(true);
});
