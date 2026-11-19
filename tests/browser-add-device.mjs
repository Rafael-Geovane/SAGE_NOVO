// Local isolated Auth/PostgREST fixtures only; no real account or vest writes.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const checks = [],
  errors = [],
  devices = [];
let inserts = 0,
  profilesSaved = 0,
  failSave = true,
  pending = [],
  role = "admin",
  linked = false,
  managed = false,
  generated = 0,
  readings = [],
  pairCalls = 0;
let demoPlan = "essential";
let nvidiaReady = false;
function fixtureReport() {
  const now = new Date().toISOString();
  return {
    device_code: "SGE-067",
    assignment_id: devices[0]?.assignment_id,
    start: now,
    end: new Date(Date.now() + 7 * 86400000).toISOString(),
    generated_at: now,
    timezone: "UTC",
    sources: [
      {
        source: "simulated",
        samples: generated,
        first_reading: now,
        last_reading: now,
      },
    ],
    days: [{ day: now.slice(0, 10), source: "simulated", samples: generated }],
    metrics: [
      {
        source: "simulated",
        metric: "temperature_c",
        samples: generated,
        mean: 36.5,
        minimum: 36.5,
        maximum: 36.5,
      },
    ],
    events: [],
  };
}
const id = "00000000-0000-4000-8000-000000000001";
const user = {
  id: "00000000-0000-4000-8000-000000000002",
  aud: "authenticated",
  email: "local-add-test@example.test",
};
const jwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(
    JSON.stringify({
      sub: user.id,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  "TEST_SIGNATURE",
].join(".");
async function pageForRole() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      /Encountered two children with the same key|Each child in a list/.test(
        message.text(),
      )
    )
      errors.push("Duplicate or missing React key");
  });
  await page.addInitScript(
    ({ jwt, user }) =>
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      ),
    { jwt, user },
  );
  await page.route("http://127.0.0.1:54399/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    const respond = (data, status = 200, count) =>
      route.fulfill({
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
          "Access-Control-Expose-Headers": "Content-Range",
          ...(count === undefined
            ? {}
            : { "Content-Range": `0-${Math.max(0, count - 1)}/${count}` }),
        },
        body: method === "HEAD" ? "" : JSON.stringify(data),
      });
    if (method === "OPTIONS") return respond({});
    if (url.pathname.endsWith("/functions/v1/weekly-analysis")) {
      const input = req.postDataJSON();
      assert.equal(input.consent, true);
      if (!nvidiaReady) return respond({ error: "nvidia_not_configured" }, 503);
      return respond({
        mode: "nvidia",
        model: "nvidia/nemotron-3.5-bolt-e4b",
        generated_at: new Date().toISOString(),
        summary: "Resumo NVIDIA com base nas amostras da semana.",
        observations: ["Dados simulados."],
        improvements: ["Verificar cobertura."],
        attention: ["Revisar eventos."],
        health_status: "Os registros não confirmam o estado de saúde.",
        paragraphs: ["Resumo NVIDIA com base nas amostras da semana."],
        report: fixtureReport(),
      });
    }
    if (url.pathname.endsWith("/demo_subscriptions"))
      return respond({ plan: demoPlan });
    if (url.pathname.endsWith("/rpc/select_demo_plan")) {
      demoPlan = req.postDataJSON().p_plan;
      return respond({ plan: demoPlan, mode: "demo" });
    }
    if (url.pathname.endsWith("/rpc/weekly_device_report"))
      return respond(fixtureReport());
    if (url.pathname.endsWith("/rpc/export_weekly_report"))
      return demoPlan === "essential"
        ? respond({}, 403)
        : respond(fixtureReport());
    if (url.pathname.endsWith("/rpc/demo_weekly_analysis"))
      return demoPlan === "premium"
        ? respond({
            mode: "demo_rules",
            generated_at: new Date().toISOString(),
            report: fixtureReport(),
            paragraphs: ["Resumo demonstrativo da semana com dados simulados."],
          })
        : respond({}, 403);
    if (url.pathname === "/auth/v1/user") return respond(user);
    if (url.pathname.endsWith("/profiles"))
      return respond(
        req.headers().accept?.includes("vnd.pgrst.object")
          ? { id: user.id, role, display_name: "CONTA DE TESTE" }
          : [{ id: user.id, role, display_name: "CONTA DE TESTE" }],
      );
    if (url.pathname.endsWith("/rpc/touch_activity")) return respond(null);
    if (url.pathname.endsWith("/rpc/can_manage_device_profile"))
      return respond(role === "admin" || managed);
    if (url.pathname.endsWith("/rpc/lookup_connected_device")) {
      const { p_code } = req.postDataJSON();
      return respond(
        managed && p_code === "SGE-067"
          ? { device_id: id, page: 0, configure_profile: true }
          : null,
      );
    }
    if (url.pathname.endsWith("/rpc/emit_simulated_reading")) {
      assert.equal(managed, true);
      const row = devices[0],
        input = req.postDataJSON();
      assert.equal(input.p_device_id, id);
      assert.equal(input.p_expected_assignment_id, row.assignment_id);
      generated++;
      const now = new Date().toISOString();
      row.last_received_at = now;
      row.latest_recorded_at = now;
      row.latest_metrics = {
        heart_rate_bpm: 60 + generated,
        spo2_percent: 97,
        temperature_c: 36.5,
        battery_percent: 70,
      };
      readings.unshift({
        id: generated,
        device_id: id,
        person_id: row.person_id,
        assignment_id: row.assignment_id,
        recorded_at: now,
        received_at: now,
        metrics: row.latest_metrics,
        event: null,
        source: "simulated",
      });
      return respond({
        status: 200,
        accepted: true,
        duplicate: false,
        received_at: now,
      });
    }
    if (url.pathname.endsWith("/telemetry")) {
      const assignment = url.searchParams.get("assignment_id")?.slice(3);
      const rows = readings.filter((r) => r.assignment_id === assignment);
      return respond(rows, 200, rows.length);
    }
    if (url.pathname.endsWith("/rpc/complete_device_profile")) {
      if (failSave)
        return respond({ code: "22023", message: "fixture failure" }, 400);
      const input = req.postDataJSON(),
        row = devices[0];
      assert.equal(input.p_device_id, id);
      assert.equal(input.p_expected_assignment_id, row.assignment_id);
      assert.equal(input.p_data.consent_confirmed, true);
      profilesSaved++;
      row.person_id = "00000000-0000-4000-8000-000000000004";
      row.assignment_id = "00000000-0000-4000-8000-000000000005";
      row.people = {
        ...input.p_data,
        id: row.person_id,
        consent_recorded_at: new Date().toISOString(),
      };
      return respond({
        device_id: id,
        person_id: row.person_id,
        assignment_id: row.assignment_id,
      });
    }
    if (url.pathname.endsWith("/rpc/review_fall_alert")) {
      const input = req.postDataJSON();
      assert.equal(input.p_outcome, "dismissed");
      pending = pending.filter((row) => row.id !== input.target);
      return respond(null);
    }
    if (url.pathname.endsWith("/rpc/triage_alert")) {
      const input = req.postDataJSON();
      pending = pending.map((row) =>
        row.id === input.target ? { ...row, status: input.new_status } : row,
      );
      return respond(null);
    }
    if (url.pathname.endsWith("/alerts"))
      return respond(pending, 200, pending.length);
    if (url.pathname.endsWith("/rpc/connect_device")) {
      pairCalls++;
      const input = req.postDataJSON();
      assert.equal(input.p_code, "SGE-001");
      assert.equal(input.p_activation_code, "b".repeat(32));
      linked = true;
      return respond({ status: "connected", device_id: id, page: 0 });
    }
    if (url.pathname.endsWith("/devices")) {
      if (method === "POST") {
        assert.equal(role, "admin");
        const input = req.postDataJSON();
        assert.equal(input.code, "SGE-001");
        assert.equal(input.person_id, null);
        assert.equal(input.enabled, true);
        inserts++;
        devices.push({
          id,
          code: input.code,
          person_id: null,
          assignment_id: "00000000-0000-4000-8000-000000000003",
          enabled: true,
          firmware_version: null,
          last_received_at: null,
          latest_recorded_at: null,
          latest_metrics: null,
          people: null,
        });
        return respond({ id }, 201);
      }
      const allowed = role === "admin" || linked ? devices : [];
      if (method === "HEAD")
        return respond(
          null,
          200,
          allowed.filter(
            (row) => row.code < (url.searchParams.get("code")?.slice(3) ?? ""),
          ).length,
        );
      const code = url.searchParams.get("code");
      if (code?.startsWith("eq."))
        return respond(
          allowed
            .filter((row) => row.code === code.slice(3))
            .map((row) => ({ id: row.id })),
          200,
        );
      if (url.searchParams.has("id")) {
        const row = allowed[0];
        return respond(
          row
            ? {
                id: row.id,
                person_id: row.person_id,
                assignment_id: row.assignment_id,
                people: row.people,
              }
            : null,
        );
      }
      return respond(allowed, 200, allowed.length);
    }
    return respond([], 200, 0);
  });
  await page.goto("http://127.0.0.1:5174/dashboard", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Meus coletes", exact: true })
    .waitFor();
  return page;
}
try {
  await mkdir("docs/screenshots", { recursive: true });
  const admin = await pageForRole();
  await admin
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  const dialog = admin.getByRole("dialog");
  assert.equal(await dialog.getByLabel("Código de ativação").count(), 0);
  await dialog
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await dialog.getByText("Use o formato SGE-000.", { exact: true }).waitFor();
  assert.equal(inserts, 0);
  await dialog.getByLabel("Código do colete").fill(" sge-001 ");
  await admin.screenshot({
    path: "docs/screenshots/add-device-desktop.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await dialog.getByLabel("Nome do idoso").waitFor();
  await dialog
    .getByRole("button", { name: "Salvar dados do idoso", exact: true })
    .click();
  await dialog.getByText("Informe o nome do idoso.", { exact: true }).waitFor();
  assert.equal(profilesSaved, 0);
  await dialog.getByLabel("Nome do idoso").fill("PESSOA FICTÍCIA");
  await dialog
    .getByLabel("Endereço (opcional)", { exact: true })
    .fill("Endereço de teste");
  await dialog.getByLabel("Alergias", { exact: true }).selectOption("reported");
  await dialog.getByLabel("Quais alergias?").fill("Alergia fictícia");
  await dialog
    .getByLabel("Doenças e condições informadas (opcional)", { exact: true })
    .fill("Relato fictício");
  await dialog
    .getByLabel("Registro da autorização")
    .fill("Autorização fictícia para teste");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Salvar dados do idoso", exact: true })
    .click();
  await dialog
    .getByText(
      "Não foi possível salvar. Confira os dados, o consentimento e tente novamente.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await dialog.getByLabel("Nome do idoso").inputValue(),
    "PESSOA FICTÍCIA",
  );
  failSave = false;
  await dialog.evaluate((el) => el.scrollTo(0, 0));
  await admin.screenshot({
    path: "docs/screenshots/elder-profile-desktop.png",
    fullPage: false,
  });
  await admin.setViewportSize({ width: 360, height: 900 });
  await admin.screenshot({
    path: "docs/screenshots/elder-profile-mobile.png",
    fullPage: false,
  });
  assert.equal(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await dialog
    .getByRole("button", { name: "Salvar dados do idoso", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(profilesSaved, 1);
  await admin.locator(".device-card").filter({ hasText: "SGE-001" }).waitFor();
  assert.equal(inserts, 1);
  checks.push(
    "Admin sees Adicionar colete, validates code, creates with code only and selects the vest",
  );
  await admin
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await dialog.getByLabel("Código do colete").fill("SGE-001");
  await dialog
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await dialog.getByLabel("Nome do idoso").waitFor();
  assert.equal(
    await dialog.getByLabel("Nome do idoso").inputValue(),
    "PESSOA FICTÍCIA",
  );
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  assert.equal(inserts, 1);
  checks.push(
    "Adding the same printed code selects the existing vest without another insert",
  );
  await admin.setViewportSize({ width: 360, height: 900 });
  await admin
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await dialog.waitFor();
  assert.equal(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  const box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 361);
  await admin.screenshot({
    path: "docs/screenshots/add-device-mobile.png",
    fullPage: true,
  });
  await admin.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  checks.push("Mobile button/modal fit at 360px; Escape closes the modal");
  // Inject test-only events into this route fixture, never into Supabase.
  pending = [
    {
      id: "00000000-0000-4000-8000-000000000006",
      device_id: id,
      assignment_id: devices[0].assignment_id,
      kind: "fall_detected",
      status: "new",
      created_at: new Date().toISOString(),
      fall_outcome: null,
      description: "Possível queda de teste",
      severity: "info",
      devices: { code: "SGE-001" },
    },
  ];
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin
    .getByRole("button", { name: "Notificações: 1 pendentes", exact: true })
    .click();
  const inbox = admin.getByRole("dialog");
  await inbox.getByText("SGE-001 · Possível queda", { exact: true }).waitFor();
  await admin.screenshot({
    path: "docs/screenshots/notifications-mobile.png",
    fullPage: false,
  });
  await inbox
    .getByRole("button", { name: "Estou verificando", exact: true })
    .click();
  await inbox.getByText("Em verificação", { exact: true }).waitFor();
  await inbox
    .getByRole("button", { name: "Está tudo bem / descartar", exact: true })
    .click();
  const review = admin.getByRole("dialog", {
    name: "Descartar alerta",
    exact: true,
  });
  await review
    .getByRole("button", { name: "Registrar descarte", exact: true })
    .click();
  await admin
    .getByRole("dialog", {
      name: "Notificações de possível queda",
      exact: true,
    })
    .getByText("Nenhuma notificação pendente", { exact: true })
    .waitFor();
  await admin.keyboard.press("Escape");
  checks.push(
    "Elderly profile validates, preserves input on failure, saves and pre-fills existing person; site fall notification can be verified and discarded at 360px",
  );
  await admin.close();
  role = "caregiver";
  const customer = await pageForRole();
  await customer
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  const form = customer.getByRole("dialog");
  await form.getByLabel("Código do colete").fill("SGE-001");
  await form
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await form
    .getByText("Informe o código de ativação completo.", { exact: true })
    .waitFor();
  assert.equal(pairCalls, 0);
  await form
    .getByLabel("Código de ativação", { exact: true })
    .fill("b".repeat(32));
  await form
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await form.waitFor({ state: "hidden" });
  assert.equal(pairCalls, 1);
  assert.equal(inserts, 1);
  await customer
    .locator(".device-card")
    .filter({ hasText: "SGE-001" })
    .waitFor();
  assert.deepEqual(errors, []);
  checks.push(
    "Caregiver still needs valid activation proof; printed code alone grants no access",
  );
  managed = true;
  Object.assign(devices[0], {
    code: "SGE-067",
    person_id: null,
    people: null,
    assignment_id: "00000000-0000-4000-8000-000000000067",
    telemetry_source: "simulated",
    device_profile_editable: true,
  });
  await customer.reload({ waitUntil: "domcontentloaded" });
  assert.equal(
    await customer
      .getByRole("link", { name: "Testar SGE-001", exact: true })
      .count(),
    0,
  );
  await customer
    .getByRole("button", { name: "Informar código do colete", exact: true })
    .click();
  const codeForm = customer.getByRole("dialog");
  await codeForm
    .getByLabel("Código do colete", { exact: true })
    .fill(" SGE - 067 ");
  await codeForm
    .getByRole("button", { name: "Adicionar colete", exact: true })
    .click();
  await codeForm.getByLabel("Nome do idoso", { exact: true }).waitFor();
  assert.equal(
    await codeForm.getByLabel("Código de ativação", { exact: true }).count(),
    0,
  );
  await codeForm
    .getByLabel("Nome do idoso", { exact: true })
    .fill("PESSOA FICTÍCIA 067");
  await codeForm
    .getByLabel("Registro da autorização", { exact: true })
    .fill("Autorização fictícia");
  await codeForm.getByRole("checkbox").check();
  await codeForm
    .getByRole("button", { name: "Salvar dados do idoso", exact: true })
    .click();
  await codeForm.waitFor({ state: "hidden" });
  await customer
    .getByRole("button", { name: "Editar cadastro", exact: true })
    .click();
  const edit = customer.getByRole("dialog");
  assert.equal(
    await edit.getByLabel("Nome do idoso", { exact: true }).inputValue(),
    "PESSOA FICTÍCIA 067",
  );
  await edit
    .getByLabel("Nome do idoso", { exact: true })
    .fill("NOME CORRIGIDO 067");
  await edit.getByRole("checkbox").check();
  await edit
    .getByRole("button", { name: "Salvar dados do idoso", exact: true })
    .click();
  await edit.waitFor({ state: "hidden" });
  assert.equal(devices[0].people.display_name, "NOME CORRIGIDO 067");
  const initial = generated;
  await customer.waitForFunction(
    () => document.querySelectorAll("tbody tr").length > 0,
  );
  await customer.waitForTimeout(3400);
  assert.ok(
    generated > initial,
    "new persisted sample on the three-second timer",
  );
  await customer
    .getByRole("button", { name: "Pausar dados aleatórios", exact: true })
    .click();
  const paused = generated;
  await customer.waitForTimeout(3400);
  assert.equal(generated, paused, "pause stops RPC generation");
  const profileHeadings = customer.getByRole("heading", {
    name: "Dados do idoso",
    exact: true,
  });
  assert.equal(await profileHeadings.count(), 1);
  await customer
    .getByText("Origem: dados simulados.", { exact: true })
    .waitFor();
  await customer.setViewportSize({ width: 390, height: 900 });
  await customer.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  assert.equal(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await customer.screenshot({
    path: "docs/screenshots/managed-067-mobile.png",
    fullPage: true,
  });
  checks.push(
    "SGE-067 opens through a generic code field; delegated caregiver can create/edit the elder profile and persist random samples every three seconds with pause and visible provenance",
  );
  await customer.locator(".account-link").click();
  await customer.waitForURL("**/minha-conta");
  await customer
    .getByRole("heading", { name: "Seus dados", exact: true })
    .waitFor();
  await customer
    .getByText("NOME CORRIGIDO 067", { exact: true })
    .first()
    .waitFor();
  await customer
    .getByRole("button", { name: "Editar cadastro", exact: true })
    .click();
  const accountEditor = customer.getByRole("dialog");
  await accountEditor
    .getByLabel("Nome do idoso", { exact: true })
    .fill("CADASTRO VIA MINHA CONTA");
  await accountEditor.getByRole("checkbox").check();
  await accountEditor
    .getByRole("button", { name: "Salvar dados do idoso", exact: true })
    .click();
  await accountEditor.waitFor({ state: "hidden" });
  assert.equal(devices[0].people.display_name, "CADASTRO VIA MINHA CONTA");
  assert.equal(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await customer.screenshot({
    path: "docs/screenshots/account-mobile.png",
    fullPage: true,
  });
  checks.push(
    "Minha conta opens from the header; authorized elder edits persist and mobile has no overflow",
  );
  await customer.evaluate(() => {
    Notification.requestPermission = async () => {
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        value: "granted",
      });
      return "granted";
    };
  });
  await customer
    .getByRole("button", { name: "Ativar avisos do navegador", exact: true })
    .click();
  await customer
    .getByRole("button", { name: "Desativar avisos do navegador", exact: true })
    .waitFor();
  await customer.goto("http://127.0.0.1:5174/teste_colete");
  await customer
    .getByRole("button", { name: "Carregar colete", exact: true })
    .click();
  await customer
    .getByRole("button", { name: "Enviar leitura estável", exact: true })
    .waitFor();
  const beforeManual = generated;
  await customer
    .getByRole("button", { name: "Enviar leitura estável", exact: true })
    .click();
  await customer
    .getByText("Leitura enviada ao banco. Confira o dashboard.", {
      exact: true,
    })
    .waitFor();
  assert.equal(generated, beforeManual + 1);
  const scenarioRequest = customer.waitForRequest(
    (request) =>
      request.url().endsWith("/rpc/emit_simulated_reading") &&
      request.postDataJSON()?.p_scenario === "fall",
  );
  await customer
    .getByRole("button", { name: "Simular possível queda", exact: true })
    .click();
  await scenarioRequest;
  await customer
    .getByText(
      "Possível queda simulada enviada. Confira o sino e o dashboard.",
      { exact: true },
    )
    .waitFor();
  checks.push(
    "Browser notification permission can be enabled; hidden control route sends stable readings and explicit fall RPCs",
  );
  const extraRequest = customer.waitForRequest(
    (request) =>
      request.url().endsWith("/rpc/emit_simulated_reading") &&
      request.postDataJSON()?.p_scenario === "partial",
  );
  await customer
    .getByRole("button", { name: "Simular sensor sem leitura", exact: true })
    .click();
  await extraRequest;
  const batteryButton = customer.getByRole("button", {
    name: "Simular bateria em 15%",
    exact: true,
  });
  await batteryButton.click();
  assert.equal(await batteryButton.getAttribute("aria-pressed"), "true");
  await customer.waitForRequest(
    (request) =>
      request.url().endsWith("/rpc/emit_simulated_reading") &&
      request.postDataJSON()?.p_scenario === "battery",
  );
  await customer.waitForRequest(
    (request) =>
      request.url().endsWith("/rpc/emit_simulated_reading") &&
      request.postDataJSON()?.p_scenario === "battery",
  );
  await batteryButton.click();
  assert.equal(await batteryButton.getAttribute("aria-pressed"), "false");
  await customer
    .getByText("Leitura enviada ao banco. Confira o dashboard.", {
      exact: true,
    })
    .waitFor();
  await customer
    .getByRole("navigation", { name: "Menu lateral" })
    .getByRole("link", { name: "Relatórios", exact: true })
    .click();
  await customer
    .getByRole("heading", { name: "Resumo das medições", exact: true })
    .waitFor();
  assert.equal(
    await customer
      .getByRole("button", { name: "Exportar CSV", exact: true })
      .isDisabled(),
    true,
  );
  await customer
    .getByRole("navigation", { name: "Menu lateral" })
    .getByRole("link", { name: "Planos", exact: true })
    .click();
  await customer
    .getByRole("button", { name: "Experimentar SAGE Premium", exact: true })
    .click();
  assert.equal(demoPlan, "premium");
  await customer
    .getByRole("article")
    .filter({
      has: customer.getByRole("heading", { name: "SAGE Premium", exact: true }),
    })
    .getByRole("button", { name: "Plano atual", exact: true })
    .waitFor();
  await customer.screenshot({
    path: "docs/screenshots/plans-mobile.png",
    fullPage: true,
  });
  await customer
    .getByRole("navigation", { name: "Menu lateral" })
    .getByRole("link", { name: "Relatórios", exact: true })
    .click();
  await customer
    .getByRole("button", { name: "Gerar resumo por regras", exact: true })
    .click();
  await customer
    .getByText("Resumo demonstrativo da semana com dados simulados.", {
      exact: true,
    })
    .waitFor();
  const nvidiaButton = customer.getByRole("button", {
    name: "Gerar relatório com IA NVIDIA",
    exact: true,
  });
  assert.equal(await nvidiaButton.isDisabled(), true);
  await customer
    .getByRole("checkbox", { name: /Autorizo enviar à NVIDIA/ })
    .check();
  await nvidiaButton.click();
  await customer
    .getByText(
      "Configure NVIDIA_API_KEY nos secrets do Supabase para ativar a IA NVIDIA.",
      { exact: true },
    )
    .waitFor();
  nvidiaReady = true;
  await nvidiaButton.click();
  await customer
    .getByText("Resumo NVIDIA com base nas amostras da semana.", {
      exact: true,
    })
    .waitFor();
  await customer
    .getByRole("heading", {
      name: "O que aprimorar no acompanhamento",
      exact: true,
    })
    .waitFor();
  const download = customer.waitForEvent("download");
  await customer
    .getByRole("button", { name: "Exportar CSV", exact: true })
    .click();
  assert.ok((await download).suggestedFilename().endsWith(".csv"));
  assert.equal(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await customer.screenshot({
    path: "docs/screenshots/reports-mobile.png",
    fullPage: true,
  });
  await customer.setViewportSize({ width: 1440, height: 1000 });
  await customer.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await customer.screenshot({
    path: "docs/screenshots/reports-desktop.png",
    fullPage: true,
  });
  checks.push(
    "Sidebar navigates to reports and plans; Essential locks exports; Premium selection enables weekly demo analysis and CSV export; mobile fits",
  );
  Object.assign(devices[0], {
    requires_esp: true,
    esp_last_seen_at: new Date().toISOString(),
    esp_attached: false,
  });
  const samplesBeforeEsp = generated;
  await customer.goto("http://127.0.0.1:5174/dashboard");
  await customer
    .getByText("ESP ligado · fora do colete", { exact: true })
    .first()
    .waitFor();
  await customer.waitForTimeout(3400);
  assert.equal(
    generated,
    samplesBeforeEsp,
    "browser must not generate samples for ESP-dependent vests",
  );
  assert.equal(
    await customer
      .getByRole("button", { name: "Pausar dados aleatórios", exact: true })
      .count(),
    0,
  );
  Object.assign(devices[0], {
    esp_attached: true,
    esp_last_seen_at: new Date().toISOString(),
  });
  await customer
    .getByText("ESP conectado ao colete", { exact: true })
    .first()
    .waitFor();
  Object.assign(devices[0], {
    esp_last_seen_at: new Date(Date.now() - 13000).toISOString(),
  });
  await customer
    .getByText("ESP sem comunicação", { exact: true })
    .first()
    .waitFor();
  assert.equal(generated, samplesBeforeEsp);
  checks.push(
    "ESP-dependent vests show attachment/timeout state and never auto-generate browser telemetry",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/browser-add-device-results.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks, errors },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
