// Explicit test fixtures. These responses are never loaded by the production app.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const checks = [];
const userId = "00000000-0000-4000-8000-000000000002",
  deviceId = "00000000-0000-4000-8000-000000000005";
const device = {
  id: deviceId,
  code: "SGE-001",
  enabled: true,
  person_id: "person",
  assignment_id: "00000000-0000-4000-8000-000000000007",
  firmware_version: null,
  last_received_at: new Date(Date.now() - 60000).toISOString(),
  latest_recorded_at: new Date(Date.now() - 60000).toISOString(),
  latest_metrics: { battery_percent: 53, heart_rate_bpm: null },
  people: {
    id: "person",
    display_name: "PESSOA DE TESTE",
    consent_recorded_at: new Date().toISOString(),
    contact_name: null,
    contact_phone: null,
  },
};
let role = "caregiver",
  failed = false,
  revoked = false,
  supportFailed = false;
const storedMessages = [];
const conversations = [];
const token = () =>
  [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(
      JSON.stringify({
        sub: userId,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "TEST_SIGNATURE",
  ].join(".");
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://127.0.0.1:54399/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method();
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
    };
    const respond = (data, status = 200, count) =>
      route.fulfill({
        status,
        headers: {
          ...cors,
          ...(count !== undefined
            ? { "Content-Range": `0-${Math.max(count - 1, 0)}/${count}` }
            : {}),
        },
        body: JSON.stringify(data),
      });
    if (method === "OPTIONS") return respond({});
    if (url.pathname.includes("/auth/v1/token"))
      return respond({
        access_token: token(),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh",
        user: {
          id: userId,
          email: "fixture@example.test",
          aud: "authenticated",
          role: "authenticated",
        },
      });
    if (url.pathname.includes("/auth/v1/user"))
      return respond({
        id: userId,
        email: "fixture@example.test",
        aud: "authenticated",
        role: "authenticated",
      });
    if (url.pathname.includes("/auth/v1/logout")) return respond({});
    if (url.pathname.endsWith("/rpc/admin_dashboard"))
      return respond({
        active_users: 1,
        caregivers: 1,
        devices: 1,
        recent_devices: 0,
        recent_alerts: 0,
        enabled_devices: 1,
        disabled_devices: 0,
        recent_readings: 0,
        open_alerts: 0,
        generated_at: new Date().toISOString(),
      });
    if (url.pathname.includes("/rpc/")) return respond(null);
    if (failed)
      return respond({ code: "PGRST000", message: "fixture outage" }, 503);
    const table = url.pathname.split("/").pop();
    if (table === "profiles") {
      const rows = [
        {
          id: userId,
          display_name: "CONTA DE TESTE",
          role,
          last_seen_at: new Date().toISOString(),
        },
      ];
      return respond(url.searchParams.get("id") ? rows[0] : rows, 200, 1);
    }
    if (table === "devices") {
      const data = revoked ? [] : [device];
      if (method === "POST" || method === "PATCH")
        return respond({ id: deviceId });
      return respond(data, 200, data.length);
    }
    if (table === "telemetry") return respond([], 200, 0);
    if (table === "alerts") return respond([], 200, 0);
    if (table === "people") return respond([device.people], 200, 1);
    if (table === "caregiver_device_links") return respond([], 200, 0);
    if (table === "support_conversations") {
      if (method === "POST") {
        const data = request.postDataJSON();
        const c = {
          id: "00000000-0000-4000-8000-000000000006",
          requester_id: userId,
          subject: data.subject,
          status: "open",
          created_at: new Date().toISOString(),
        };
        conversations.push(c);
        return respond({ id: c.id });
      }
      return respond(conversations, 200, conversations.length);
    }
    if (table === "support_messages") {
      if (method === "POST") {
        if (supportFailed) return respond({ message: "fixture offline" }, 503);
        const data = request.postDataJSON();
        const msg = {
          ...data,
          id: "message-1",
          sender_id: userId,
          created_at: new Date().toISOString(),
        };
        storedMessages.push(msg);
        return respond(msg);
      }
      return respond(storedMessages, 200, storedMessages.length);
    }
    return respond([]);
  });
  async function login() {
    await page.goto("http://127.0.0.1:5174/auth");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await page.getByRole("heading", { name: "Olá, CONTA." }).waitFor();
  }
  await login();
  await page.getByRole("button", { name: /SGE-001/ }).waitFor();
  await page
    .getByText("Os dados estão desatualizados.", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByText("Não informado pelo dispositivo", { exact: true })
      .count(),
    3,
  );
  checks.push(
    "Caregiver sees only authorized fixtures and explicit stale/missing readings",
  );
  await page.goto("http://127.0.0.1:5174/admin");
  await page.getByText("Acesso restrito à equipe SAGE").waitFor();
  checks.push("Caregiver admin route denied");
  await page.goto("http://127.0.0.1:5174/suporte");
  await page.getByLabel("Assunto").fill("Dúvida de teste");
  await page
    .getByLabel("Sua mensagem")
    .fill("Mensagem de teste sem dados reais.");
  supportFailed = true;
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await page
    .getByText("Não foi possível confirmar o envio.", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByLabel("Sua mensagem").inputValue(),
    "Mensagem de teste sem dados reais.",
  );
  supportFailed = false;
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await page.getByText("Mensagem registrada no suporte interno.").waitFor();
  assert.equal(storedMessages.length, 1);
  assert.equal(conversations.length, 1);
  checks.push("Support failure preserves draft and retry reuses conversation");
  await page.getByLabel("Sua mensagem").fill("Rascunho de teste");
  await page.getByRole("link", { name: "Acompanhamento", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Continuar escrevendo" }).click();
  assert.equal(
    await page.getByLabel("Sua mensagem").inputValue(),
    "Rascunho de teste",
  );
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Continuar escrevendo" }).click();
  await page.getByRole("button", { name: "Descartar rascunho" }).click();
  checks.push("Unsaved-message navigation uses accessible confirmation");
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .first()
    .click();
  await page.getByText("Entre para continuar").waitFor();
  role = "admin";
  await login();
  await page.getByRole("link", { name: "Administração", exact: true }).click();
  await page.getByRole("heading", { name: "Administração SAGE" }).waitFor();
  await page.getByText("Usuários ativos", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Coletes", exact: true }).click();
  await page.getByRole("button", { name: "Cadastrar colete" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Código do colete").fill("bad");
  await page.getByRole("button", { name: "Salvar colete" }).click();
  await page.getByText("Use o formato SGE-001.").waitFor();
  assert.equal(await page.locator(":focus").getAttribute("name"), "code");
  await page.getByLabel("Código do colete").fill("SGE-002");
  await page.getByRole("button", { name: "Salvar colete" }).click();
  await page.getByText("Alteração salva.").waitFor();
  checks.push("Admin metrics, device dialog, validation focus and create flow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Pessoas", exact: true }).click();
  await page.getByRole("button", { name: "Cadastrar pessoa" }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checks.push("Mobile admin modal fits, keyboard Escape closes");
  await page.goto("http://127.0.0.1:5174/dashboard");
  await page.getByRole("button", { name: /SGE-001/ }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/caregiver-mobile-fixture.png",
    fullPage: true,
  });
  revoked = true;
  await page.waitForTimeout(16000);
  await page.getByText("Sua rede de cuidado começa com um vínculo").waitFor();
  assert.equal(
    await page.getByText("PESSOA DE TESTE", { exact: false }).count(),
    0,
  );
  checks.push(
    "Revoked access clears device and reading UI within refresh window",
  );
  assert.deepEqual(errors, []);
  checks.push("No runtime errors in authenticated fixture workflows");
  await writeFile(
    "docs/browser-auth-results.json",
    JSON.stringify({ fixtureOnly: true, checks }, null, 2) + "\n",
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
