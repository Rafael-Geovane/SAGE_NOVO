// Local-only WebSocket and HTTP fixtures. No production Supabase connection.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const uid = "00000000-0000-4000-8000-000000000001",
  did = "00000000-0000-4000-8000-000000000002",
  aid = "00000000-0000-4000-8000-000000000003",
  pid = "00000000-0000-4000-8000-000000000004";
const device = {
  id: did,
  code: "SGE-001",
  person_id: pid,
  assignment_id: aid,
  enabled: true,
  firmware_version: null,
  last_received_at: new Date().toISOString(),
  latest_recorded_at: new Date().toISOString(),
  latest_metrics: { battery_percent: 50 },
  people: {
    id: pid,
    display_name: "PESSOA FIXTURE",
    consent_recorded_at: new Date().toISOString(),
  },
};
const reading = (id, battery, changes = {}) => ({
  id,
  device_id: did,
  person_id: pid,
  assignment_id: aid,
  recorded_at: new Date(Date.now() + id).toISOString(),
  received_at: new Date().toISOString(),
  metrics: { battery_percent: battery },
  event: null,
  ...changes,
});
let socket,
  joined,
  joins = [],
  rows = [],
  requests = 0,
  revoked = false;
const checks = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.routeWebSocket(
    "ws://127.0.0.1:54399/realtime/v1/websocket**",
    (ws) => {
      socket = ws;
      ws.onMessage((message) => {
        if (typeof message !== "string") return;
        const [joinRef, ref, topic, event, payload] = JSON.parse(message);
        if (event === "phx_join") {
          joined = { joinRef, ref, topic };
          joins = payload.config.postgres_changes.map((filter, i) => ({
            ...filter,
            id: i + 1,
          }));
          ws.send(
            JSON.stringify([
              joinRef,
              ref,
              topic,
              "phx_reply",
              { status: "ok", response: { postgres_changes: joins } },
            ]),
          );
        } else if (event === "heartbeat" || event === "phx_leave")
          ws.send(
            JSON.stringify([
              joinRef,
              ref,
              topic,
              "phx_reply",
              { status: "ok", response: {} },
            ]),
          );
      });
    },
  );
  const emit = (row) =>
    socket.send(
      JSON.stringify([
        joined.joinRef,
        null,
        joined.topic,
        "postgres_changes",
        {
          ids: [joins.find((j) => j.table === "telemetry").id],
          data: {
            schema: "public",
            table: "telemetry",
            commit_timestamp: new Date().toISOString(),
            type: "INSERT",
            errors: [],
            columns: [],
            record: row,
            old_record: {},
          },
        },
      ]),
    );
  await page.route("http://127.0.0.1:54399/**", async (route) => {
    const url = new URL(route.request().url()),
      table = url.pathname.split("/").pop();
    const reply = (body, status = 200, count) =>
      route.fulfill({
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
          "Access-Control-Expose-Headers": "Content-Range",
          ...(count === undefined
            ? {}
            : { "Content-Range": `0-${Math.max(0, count - 1)}/${count}` }),
        },
        body: JSON.stringify(body),
      });
    if (route.request().method() === "OPTIONS") return reply({});
    if (table === "token")
      return reply({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.fixture`,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "fixture",
        user: { id: uid, email: "fixture@example.test", aud: "authenticated" },
      });
    if (table === "profiles")
      return reply({ id: uid, display_name: "TESTE", role: "caregiver" });
    if (table === "devices")
      return reply(revoked ? [] : [device], 200, revoked ? 0 : 1);
    if (table === "telemetry") {
      requests++;
      return reply(rows, 200, rows.length);
    }
    return reply([], 200, 0);
  });
  await page.goto("http://127.0.0.1:5174/auth");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await page.getByRole("heading", { name: "Olá, TESTE." }).waitFor();
  for (let i = 0; !joined && i < 50; i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(joined, "channel must join the local fixture");
  assert.ok(
    joins.every(
      (j) => j.filter === `device_id=eq.${did}` || j.filter === `id=eq.${did}`,
    ),
  );
  emit(reading(10, 77, { device_id: "foreign" }));
  emit(reading(11, 88, { assignment_id: "previous" }));
  emit(reading(12, 99, { person_id: "foreign" }));
  const own = reading(1, 25);
  rows = [own];
  emit(own);
  await page.getByRole("cell", { name: "25", exact: true }).waitFor();
  for (const value of ["77", "88", "99"])
    assert.equal(
      await page.getByRole("cell", { name: value, exact: true }).count(),
      0,
    );
  emit(own);
  assert.equal(
    await page.getByRole("cell", { name: "25", exact: true }).count(),
    1,
  );
  checks.push(
    "Real hook subscribes with device filters, rejects foreign scopes and deduplicates delivery",
  );
  const before = requests;
  rows = [reading(2, 26), own];
  socket.close({ code: 1011, reason: "fixture outage" });
  await page
    .getByRole("cell", { name: "26", exact: true })
    .waitFor({ timeout: 22000 });
  assert.ok(
    requests > before,
    "history must refetch while realtime is unavailable",
  );
  checks.push(
    "Disconnected realtime reconciles one bounded history page through polling",
  );
  revoked = true;
  await page
    .getByText("Sua rede de cuidado começa com um vínculo")
    .waitFor({ timeout: 22000 });
  assert.equal(
    await page.getByText("PESSOA FIXTURE", { exact: false }).count(),
    0,
  );
  checks.push("Revoked assignment clears displayed person and history");
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/browser-realtime-results.json",
    JSON.stringify({ fixturesOnly: true, checks }, null, 2) + "\n",
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
