import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.SAGE_TEST_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [],
    writes = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.method() !== "HEAD")
      writes.push(request.url());
  });
  await page.goto(`${base}/pagamento`);
  await page.getByRole("heading", { name: "Como você quer pagar?" }).waitFor();
  await page.reload();
  await page.getByLabel("O que deseja simular?").selectOption("plus");
  await page.getByText("R$ 99,90", { exact: true }).first().waitFor();
  await page.getByLabel("O que deseja simular?").selectOption("premium");
  await page.getByText("R$ 149,90", { exact: true }).first().waitFor();
  await page.getByLabel("O que deseja simular?").selectOption("plus");
  await page.getByRole("radio", { name: /Cartão/ }).check();
  await page.getByLabel("Cenário da apresentação").selectOption("declined");
  await page.getByRole("button", { name: /Simular pagamento de/ }).click();
  await page
    .getByRole("heading", { name: "Pagamento simulado recusado" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Pagamento simulado recusado" })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Simular novamente" }).click();
  await page.getByLabel("Cenário da apresentação").selectOption("approved");
  await page.getByRole("radio", { name: /Pix/ }).check();
  await page.getByRole("button", { name: /Simular pagamento de/ }).click();
  await page
    .getByRole("heading", { name: "Pagamento simulado aprovado!" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Experimentar recursos do plano" })
      .getAttribute("href"),
    "/planos",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "sage-cart",
      JSON.stringify([{ variantId: "navy", quantity: 2 }]),
    ),
  );
  await page.goto(`${base}/carrinho`);
  await page
    .getByRole("link", { name: "Simular pagamento para apresentação →" })
    .click();
  assert.equal(
    await page.getByLabel("O que deseja simular?").inputValue(),
    "vest",
  );
  await page.getByText("R$ 1.600,00", { exact: true }).waitFor();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `overflow at ${width}`,
    );
  }
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/payment-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: /Cartão/ }).check();
  await page.screenshot({
    path: "docs/screenshots/payment-mobile.png",
    fullPage: true,
  });
  await page.goto(`${base}/planos`);
  assert.equal(
    await page.getByRole("link", { name: "Simular pagamento →" }).count(),
    2,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(
    "Payment checks passed: direct route/reload, card decline, Pix approval, result focus, cart total, plan links, responsive layout and zero network writes.",
  );
} finally {
  await browser.close();
}
