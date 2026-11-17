// Synthetic local UI only: do not provision accounts, devices or real telemetry.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const checks = [],
  errors = [],
  mutations = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /\.supabase\.co\//.test(request.url()) &&
      /POST|PATCH|PUT|DELETE/.test(request.method())
    )
      mutations.push(request.method());
  });
  await page.goto("http://localhost:3000/teste-colete", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Teste do colete SGE-001" })
    .waitFor();
  await page.getByText("DADOS SIMULADOS", { exact: true }).waitFor();
  const count = async () =>
    Number(await page.getByTestId("sim-count").innerText());
  assert.equal(await count(), 1);
  await page
    .getByRole("button", { name: "Gerar leitura", exact: true })
    .click();
  assert.equal(await count(), 2);
  checks.push(
    "Public SGE-001 test opens without pairing, token or login; manual reading works",
  );
  await page
    .getByRole("button", { name: "Iniciar teste", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector('[data-testid="sim-count"]').textContent) >=
      3,
    null,
    { timeout: 6000 },
  );
  await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
  const stopped = await count();
  await page.waitForTimeout(3300);
  assert.equal(await count(), stopped);
  checks.push(
    "Readings change on the real three-second timer and stop while paused",
  );
  await page
    .getByRole("button", { name: "Queda simulada", exact: true })
    .click();
  await page
    .getByRole("log")
    .getByText("Queda simulada", { exact: true })
    .waitFor();
  const simulatedNotice = page.getByRole("region", {
    name: "Notificação simulada de queda",
    exact: true,
  });
  await simulatedNotice
    .getByRole("button", { name: "Verificar no teste", exact: true })
    .click();
  await simulatedNotice.getByText(/Em verificação no teste/).waitFor();
  await simulatedNotice
    .getByRole("button", { name: "Confirmar no teste", exact: true })
    .click();
  await simulatedNotice.getByText(/Confirmação registrada no teste/).waitFor();
  checks.push(
    "Simulated fall notification supports human review locally without Supabase writes",
  );
  await page
    .getByRole("button", { name: "Bateria em 5%", exact: true })
    .click();
  assert.match(await page.getByTestId("sim-battery_percent").innerText(), /^5/);
  await page
    .getByRole("button", { name: "Evento de teste", exact: true })
    .click();
  await page
    .getByRole("log")
    .getByText("Evento de teste simulado", { exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Leituras parciais no teste" })
    .check();
  await page
    .getByRole("button", { name: "Gerar leitura", exact: true })
    .click();
  assert.equal(
    (await page.getByTestId("sim-heart_rate_bpm").innerText()).trim(),
    "--",
  );
  await page
    .getByRole("combobox", { name: "Métrica" })
    .selectOption("battery_percent");
  checks.push(
    "Test event, simulated fall, battery scenario and null readings work",
  );
  await page
    .getByRole("button", { name: "Simular desconexão", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Gerar leitura", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Desconectado no teste" })
    .waitFor();
  const disconnected = await count();
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  assert.equal(await count(), disconnected + 1);
  checks.push(
    "Disconnect blocks readings; reconnect adds a new synthetic sample",
  );
  await mkdir("docs/screenshots", { recursive: true });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `docs/screenshots/simulator-${width}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("main *, main")]
        .map((element) => ({
          tag: element.tagName,
          cls: element.className?.baseVal ?? element.className,
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
        }))
        .filter(
          (box) =>
            box.right > innerWidth + 1 &&
            !String(box.cls).includes("sim-table"),
        )
        .slice(0, 15),
    }));
    if (overflow.document > width + 1) console.log(JSON.stringify(overflow));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      `overflow at ${width}`,
    );
    assert.equal(
      await page
        .locator(".sim-vest img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
  }
  checks.push(
    "Desktop/mobile at 360/390/768/1440: image renders, no document overflow, screenshots saved",
  );
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  assert.doesNotMatch(storage, /heart_rate_bpm|fall_detected|temperature_c/);
  assert.deepEqual(mutations, []);
  await page
    .getByRole("button", { name: "Reiniciar teste", exact: true })
    .click();
  assert.equal(await count(), 1);
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Leituras parciais no teste" })
      .isChecked(),
    false,
  );
  await page.getByText("Nenhum evento simulado.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Iniciar teste", exact: true })
    .waitFor();
  await page.reload();
  await page.getByTestId("sim-count").waitFor();
  assert.equal(await count(), 1);
  assert.deepEqual(errors, []);
  checks.push(
    "Reset/reload clear synthetic state; no telemetry writes, persisted readings or runtime errors",
  );
  await writeFile(
    "docs/browser-simulator-results.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks, mutations, errors },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
