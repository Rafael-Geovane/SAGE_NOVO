import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("installs SQL and provisions existing and new accounts without role escalation", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001','{"display_name":"Existente","role":"admin"}');`);
    await pg.exec(
      readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8"),
    );
    await pg.exec(
      `insert into auth.users values ('00000000-0000-4000-8000-000000000002','{"display_name":"Nova","role":"admin"}');`,
    );
    expect(
      (
        await pg.query(
          "select display_name,role from public.profiles order by id",
        )
      ).rows,
    ).toEqual([
      { display_name: "Existente", role: "caregiver" },
      { display_name: "Nova", role: "caregiver" },
    ]);
    await pg.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`,
    );
    expect((await pg.query("select * from public.profiles")).rows).toHaveLength(
      1,
    );
    await expect(
      pg.exec("update public.profiles set role='admin'"),
    ).rejects.toThrow();
  } finally {
    await pg.close();
  }
}, 30000);
