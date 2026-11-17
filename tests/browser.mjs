// Browser-only public UI checks. Private workflow fixtures live in browser-auth.mjs.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
await mkdir("docs/screenshots", { recursive: true });
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000");
  await page
    .getByRole("heading", {
      name: "Mais presença. Mais cuidado. Mais liberdade.",
    })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/home-desktop.png",
    fullPage: true,
  });
  results.push("Desktop landing rendered");
  const navigation = page.getByRole("navigation", {
    name: "Navegação principal",
  });
  await navigation
    .getByRole("link", { name: "Como funciona", exact: true })
    .click();
  await page
    .getByRole("heading", {
      level: 1,
      name: "Do colete à sua rede de cuidado.",
    })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/como-funciona");
  assert.equal(await page.title(), "Como funciona · SAGE");
  assert.equal(
    await navigation
      .getByRole("link", { name: "Como funciona", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    await page
      .locator("footer")
      .getByRole("link", { name: "Como funciona", exact: true })
      .getAttribute("href"),
    "/como-funciona",
  );
  const question = page.getByText("Os avisos chegam com o site fechado?", {
    exact: true,
  });
  await question.focus();
  await page.keyboard.press("Enter");
  assert.equal(await question.locator("..").getAttribute("open"), "");
  await page
    .getByRole("link", { name: "Conhecer as etapas", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Um vínculo é o primeiro passo.",
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/screenshots/how-it-works-desktop.png",
    fullPage: true,
  });
  results.push(
    "Como funciona is public, linked in header/footer, has active navigation, page title and keyboard FAQ",
  );
  await page
    .getByRole("link", { name: "Experimentar o teste", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Teste do colete SGE-001", exact: true })
    .waitFor();
  results.push("How it works test link opens the existing SGE-001 simulator");
  await page.goto("http://localhost:3000");
  await page.getByRole("link", { name: /Conheça o Smart Vest/ }).click();
  await page.getByRole("heading", { name: "SAGE Smart Vest." }).waitFor();
  await page.getByRole("button", { name: "Branco", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Branco", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Adicionar à intenção" }).click();
  await page.getByRole("link", { name: /Revisar intenção/ }).click();
  await page.getByText("Branco · Quantidade: 1").waitFor();
  results.push("Variant selection and cart persisted");
  await page.getByRole("link", { name: "Continuar para contato" }).click();
  await page
    .getByRole("heading", { name: "Bom ter você por perto." })
    .waitFor();
  const unconfigured = await page
    .getByText("Contas ainda não configuradas", { exact: true })
    .isVisible();
  assert.equal(
    await page
      .getByRole("button", { name: /Entrar na minha conta/ })
      .isDisabled(),
    unconfigured,
  );
  results.push(
    "Checkout leads to authentication; login availability matches configuration",
  );
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page
    .getByRole("heading", { name: "Vamos recuperar seu acesso." })
    .waitFor();
  results.push("Recovery form reachable");
  await page.goto("http://localhost:3000/dashboard");
  await page
    .getByText(unconfigured ? "Conecte sua conta SAGE" : "Entre para continuar")
    .waitFor();
  results.push("Protected route requires a configured authenticated account");
  await page.goto("http://localhost:3000/does-not-exist");
  await page
    .getByRole("heading", { name: "Esta página não está por aqui." })
    .waitFor();
  results.push("404 has return navigation");
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/loja",
      "/como-funciona",
      "/carrinho",
      "/auth",
      "/admin",
      "/suporte",
    ]) {
      await page.goto(`http://localhost:3000${route}`);
      await page.locator("main").waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        `horizontal overflow ${width} ${route}`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/como-funciona");
  await page.screenshot({
    path: "docs/screenshots/how-it-works-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Como funciona", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  results.push(
    "Como funciona fits all four widths and closes the mobile menu after navigation",
  );
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Smart Vest" })
    .click();
  await page.getByRole("heading", { name: "SAGE Smart Vest." }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/shop-mobile.png",
    fullPage: true,
  });
  results.push("Mobile menu and layouts at 360/390/768/1440 px");
  await page.goto("http://localhost:3000/carrinho");
  await page.getByRole("button", { name: "Remover referência Branco" }).click();
  await page
    .getByRole("heading", { name: "Nenhum colete selecionado" })
    .waitFor();
  results.push("Cart removal and empty state");
  await page.goto("http://localhost:3000");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.locator(":focus").textContent(),
    "Pular para o conteúdo",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
    "auto",
  );
  results.push("Keyboard skip link and reduced-motion contract");
  assert.deepEqual(errors, []);
  results.push("No browser runtime errors");
  await writeFile(
    "docs/browser-results.json",
    JSON.stringify(
      { date: new Date().toISOString(), checks: results },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
