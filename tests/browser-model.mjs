import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.SAGE_TEST_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const checks = [],
  errors = [];
await mkdir("docs/screenshots", { recursive: true });
try {
  console.log("Browser launched");
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      console.log(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  assert.equal((await page.request.get(base + "/modelo")).status(), 200);
  await page.goto(base + "/modelo");
  console.log("Model route opened");
  await page
    .getByRole("heading", { name: "Conheça o SAGE Smart Vest", exact: true })
    .waitFor();
  await page
    .getByText("Preparando o modelo 3D…", { exact: true })
    .waitFor({ state: "hidden" });
  const canvas = page.locator(".product-canvas canvas");
  await canvas.waitFor();
  console.log("Model canvas ready");
  assert.equal(
    await page
      .getByRole("button", { name: "Aproximar modelo", exact: true })
      .isEnabled(),
    true,
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: "docs/screenshots/model-exterior-desktop.png",
    fullPage: true,
  });
  const before = await canvas.screenshot();
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(before.equals(await canvas.screenshot()), false);
  await page.keyboard.press("Home");
  await page
    .getByRole("button", { name: /Caixa eletrônica removível/ })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Vista explodida", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const canvasSize = await canvas.boundingBox();
  await canvas.click({
    position: { x: canvasSize.width * 0.25, y: canvasSize.height * 0.6 },
  });
  assert.equal(
    await page
      .getByRole("button", { name: /Colete vestível/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page
    .getByRole("button", { name: "Vista explodida", exact: true })
    .click();
  await page.getByRole("button", { name: /MAX30102/ }).click();
  await page.getByRole("heading", { name: "MAX30102", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Vista explodida", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: "docs/screenshots/model-exploded-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Simular", exact: true }).click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  const paused = await canvas.screenshot();
  assert.ok(paused.equals(await canvas.screenshot()));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByText("Montagem concluída", { exact: true })
    .waitFor({ timeout: 45000 });
  assert.ok(!paused.equals(await canvas.screenshot()));
  await page.getByRole("button", { name: "Repetir", exact: true }).click();
  await page
    .getByRole("button", { name: "Vista externa", exact: true })
    .click();
  await page.getByRole("button", { name: "Simular", exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Simular", exact: true }).click();
  await page.getByText("Montagem concluída", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Vista explodida", exact: true })
    .click();
  checks.push(
    "Assembly playback, pause, completion, replay, view switching and reduced motion passed",
  );
  for (const width of [360, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      `no overflow at ${width}px`,
    );
    const size = await canvas.boundingBox();
    assert.ok(size.width > 200 && size.height >= 400);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: "docs/screenshots/model-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Modelo 3D", exact: true })
    .click();
  await page.reload();
  await canvas.waitFor();
  await page
    .getByRole("button", { name: "Ver alternativa em imagens", exact: true })
    .click();
  await page.locator(".product-fallback img").waitFor();
  assert.equal(await canvas.count(), 0);
  await page
    .getByRole("button", { name: "Voltar ao modelo 3D", exact: true })
    .click();
  await canvas.waitFor();
  checks.push(
    "Direct SPA entry/reload, WebGL rendering, keyboard rotation, component selection, exploded view, navigation, manual fallback and 360–1440px layouts passed",
  );
  assert.deepEqual(errors, []);
  const fallback = await browser.newPage({
    viewport: { width: 390, height: 900 },
  });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.goto(base + "/modelo");
  await fallback.getByText(/Não foi possível iniciar o 3D/).waitFor();
  const image = fallback.locator(".product-fallback img");
  await image.waitFor();
  assert.equal(
    await image.evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  checks.push(
    "Unavailable WebGL shows useful error and a correctly identified 2D alternative",
  );
  await writeFile(
    "docs/browser-model-results.json",
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
