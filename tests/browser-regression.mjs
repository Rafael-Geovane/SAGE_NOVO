import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
async function fixture() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install();
  const uid = "00000000-0000-4000-8000-000000000001",
    did = "00000000-0000-4000-8000-000000000005";
  const d = {
    id: did,
    code: "SGE-001",
    enabled: true,
    person_id: "old-person",
    assignment_id: "00000000-0000-4000-8000-000000000007",
    last_received_at: new Date().toISOString(),
    latest_recorded_at: new Date().toISOString(),
    latest_metrics: {},
    people: { id: "old-person", display_name: "Pessoa anterior de teste" },
  };
  const state = {
    device: d,
    failRefresh: false,
    delay: false,
    release: null,
    lastMessage: null,
    newConversations: 0,
    profileRole: "admin",
    profileListName: "TESTE ADMIN",
    holdProfile: false,
    releaseProfile: null,
  };
  const conversations = Array.from({ length: 26 }, (_, i) => ({
    id: `conversation-${i}`,
    subject: `Conversa teste ${i}`,
    status: "open",
    requester_id: uid,
    created_at: new Date().toISOString(),
  }));
  await page.route("http://127.0.0.1:54399/**", async (route) => {
    const r = route.request(),
      u = new URL(r.url()),
      method = r.method(),
      table = u.pathname.split("/").pop();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
      "Content-Type": "application/json",
    };
    const out = (body, status = 200, count) =>
      route.fulfill({
        status,
        headers: {
          ...headers,
          ...(count !== undefined
            ? { "Content-Range": `0-${Math.max(count - 1, 0)}/${count}` }
            : {}),
        },
        body: JSON.stringify(body),
      });
    if (method === "OPTIONS") return out({});
    if (u.pathname.includes("/auth/v1/token")) {
      if (
        state.failRefresh &&
        u.searchParams.get("grant_type") === "refresh_token"
      )
        return out({ msg: "test refresh unavailable" }, 503);
      return out({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "fixture",
        user: { id: uid, email: "fixture@example.test", aud: "authenticated" },
      });
    }
    if (u.pathname.includes("/auth/v1/user"))
      return out({ id: uid, email: "fixture@example.test" });
    if (u.pathname.includes("/auth/v1/logout")) return out({});
    if (u.pathname.includes("/rpc/")) return out(null);
    if (table === "profiles") {
      const p = {
        id: uid,
        display_name: "TESTE ADMIN",
        role: state.profileRole,
      };
      if (u.searchParams.get("id") && state.holdProfile) {
        state.holdProfile = false;
        await new Promise((resolve) => {
          state.releaseProfile = resolve;
        });
      }
      return out(
        u.searchParams.get("id")
          ? p
          : [{ ...p, display_name: state.profileListName }],
        200,
        1,
      );
    }
    if (table === "devices") return out([d], 200, 1);
    if (table === "telemetry") {
      const rows =
        u.searchParams.get("person_id") === "eq.new-person"
          ? []
          : [
              {
                id: 1,
                person_id: "old-person",
                recorded_at: new Date().toISOString(),
                received_at: new Date().toISOString(),
                metrics: { heart_rate_bpm: 91.7 },
                event: null,
              },
            ];
      return out(rows, 200, rows.length);
    }
    if (table === "alerts") {
      const rows =
        u.searchParams.get("person_id") === "eq.new-person"
          ? []
          : [
              {
                id: "alert-old",
                device_id: did,
                person_id: "old-person",
                description: "EVENTO DA PESSOA ANTERIOR",
                severity: "info",
                status: "new",
                created_at: new Date().toISOString(),
              },
            ];
      return out(rows, 200, rows.length);
    }
    if (table === "support_conversations") {
      if (method === "POST") {
        state.newConversations++;
        return out({ id: `new-conversation-${state.newConversations}` });
      }
      const offset = Number(u.searchParams.get("offset") ?? 0);
      return out(conversations.slice(offset, offset + 25), 200, 26);
    }
    if (table === "support_messages") {
      if (method === "POST") {
        state.lastMessage = r.postDataJSON();
        if (state.delay)
          await new Promise((resolve) => {
            state.release = resolve;
          });
        return out({
          id: "msg",
          ...state.lastMessage,
          sender_id: uid,
          created_at: new Date().toISOString(),
        });
      }
      return out([], 200, 0);
    }
    return out([], 200, 0);
  });
  await page.goto("http://127.0.0.1:5174/auth");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await page.getByRole("heading", { name: "Olá, TESTE." }).waitFor();
  return { page, state, context };
}
async function scenario(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  const f = await fixture();
  try {
    await fn(f);
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  } finally {
    f.state.release?.();
    f.state.releaseProfile?.();
    await f.context.close();
  }
}
try {
  await scenario(
    "token refresh preserves same-user support draft",
    async ({ page, state }) => {
      await page
        .getByRole("link", { name: "Suporte interno", exact: true })
        .click();
      await page
        .getByLabel("Assunto")
        .fill("Assunto mantido durante renovação");
      await page
        .getByLabel("Sua mensagem")
        .fill("Rascunho mantido durante renovação");
      state.holdProfile = true;
      const profileRequest = page.waitForRequest(
        (request) =>
          request.url().includes("/rest/v1/profiles?") &&
          new URL(request.url()).searchParams.has("id"),
      );
      const profileResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/rest/v1/profiles?") &&
          new URL(response.url()).searchParams.has("id"),
      );
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
      });
      await profileRequest;
      assert.equal(
        await page.getByLabel("Sua mensagem").inputValue({ timeout: 3000 }),
        "Rascunho mantido durante renovação",
      );
      assert.equal(
        await page.getByLabel("Assunto").inputValue(),
        "Assunto mantido durante renovação",
      );
      state.releaseProfile();
      await profileResponse;
      assert.equal(
        await page.getByLabel("Sua mensagem").inputValue(),
        "Rascunho mantido durante renovação",
      );
      assert.equal(new URL(page.url()).pathname, "/suporte");
    },
  );
  await scenario(
    "token refresh survives a delayed older profile response",
    async ({ page, state }) => {
      state.holdProfile = true;
      const profileRequest = page.waitForRequest(
        (request) =>
          request.url().includes("/rest/v1/profiles?") &&
          new URL(request.url()).searchParams.has("id"),
      );
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { data } = await supabase.auth.getSession();
        const parts = data.session.access_token.split(".");
        const payload = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        payload.exp = Math.floor(Date.now() / 1000) + 120;
        parts[1] = btoa(JSON.stringify(payload))
          .replace(/=/g, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
        const { error } = await supabase.auth.setSession({
          access_token: parts.join("."),
          refresh_token: "fixture",
        });
        if (error) throw error;
      });
      await profileRequest;
      const refreshed = await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { data, error } = await supabase.auth.refreshSession();
        if (error) throw error;
        return data.session.expires_in;
      });
      assert.ok(refreshed > 120);
      state.releaseProfile();
      await page.getByRole("heading", { name: "Olá, TESTE." }).waitFor();
      state.failRefresh = true;
      await page.clock.fastForward(121000);
      await page
        .getByRole("heading", { name: "Olá, TESTE." })
        .waitFor({ timeout: 3000 });
      assert.equal(
        await page.getByText("Entre para continuar", { exact: true }).count(),
        0,
      );
    },
  );
  await scenario(
    "token refresh rechecks role and clears cached administrative rows",
    async ({ page, state }) => {
      await page
        .getByRole("link", { name: "Administração", exact: true })
        .click();
      await page.getByRole("button", { name: "Usuários", exact: true }).click();
      await page
        .getByRole("cell", { name: "TESTE ADMIN", exact: true })
        .waitFor();
      state.profileRole = "caregiver";
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
      });
      await page
        .getByText("Acesso restrito à equipe SAGE", { exact: true })
        .waitFor({ timeout: 3000 });
      assert.equal(
        await page
          .getByRole("cell", { name: "TESTE ADMIN", exact: true })
          .count(),
        0,
      );
      state.profileRole = "admin";
      state.profileListName = "ADMIN APÓS PROMOÇÃO";
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
      });
      await page.getByRole("button", { name: "Usuários", exact: true }).click();
      await page
        .getByRole("cell", { name: "ADMIN APÓS PROMOÇÃO", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("cell", { name: "TESTE ADMIN", exact: true })
          .count(),
        0,
      );
    },
  );
  await scenario(
    "token refresh preserves password recovery mode",
    async ({ page }) => {
      const fragment = await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { data } = await supabase.auth.getSession();
        return new URLSearchParams({
          access_token: data.session.access_token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_in: "3600",
          type: "recovery",
        }).toString();
      });
      await page.goto(`http://127.0.0.1:5174/auth#${fragment}`);
      await page
        .getByRole("heading", { name: "Defina uma nova senha." })
        .waitFor();
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
      });
      await page
        .getByRole("heading", { name: "Defina uma nova senha." })
        .waitFor();
      assert.equal(new URL(page.url()).pathname, "/auth");
    },
  );
  await scenario(
    "session expiry independently hides cached private data",
    async ({ page, state }) => {
      await page
        .getByRole("link", { name: "Administração", exact: true })
        .click();
      await page.getByRole("button", { name: "Usuários", exact: true }).click();
      await page.getByRole("cell", { name: "TESTE ADMIN" }).waitFor();
      state.failRefresh = true;
      await page.clock.fastForward(3601000);
      await page
        .getByText("Entre para continuar", { exact: true })
        .waitFor({ timeout: 3000 });
      assert.equal(
        await page.getByRole("cell", { name: "TESTE ADMIN" }).count(),
        0,
      );
    },
  );
  await scenario(
    "reassignment scopes alerts and admin history to current person",
    async ({ page, state }) => {
      await page.getByText("EVENTO DA PESSOA ANTERIOR").waitFor();
      state.device.person_id = "new-person";
      state.device.people = {
        id: "new-person",
        display_name: "Nova pessoa de teste",
      };
      state.device.latest_metrics = null;
      state.device.latest_recorded_at = null;
      await page.waitForTimeout(16000);
      await page
        .getByRole("heading", { name: "SGE-001 · Nova pessoa de teste" })
        .waitFor();
      const oldAlert = await page
        .getByText("EVENTO DA PESSOA ANTERIOR")
        .count();
      const oldHistory = await page
        .getByRole("cell", { name: "91,7", exact: true })
        .count();
      assert.deepEqual(
        { oldAlert, oldHistory },
        { oldAlert: 0, oldHistory: 0 },
      );
    },
  );
  await scenario(
    "conversation paging creates a new conversation",
    async ({ page, state }) => {
      await page.goto("http://127.0.0.1:5174/suporte");
      await page
        .getByRole("button", { name: /Conversa teste 0 Aberta/ })
        .click();
      await page
        .locator("aside")
        .getByRole("button", { name: "Próxima" })
        .click();
      await page.getByLabel("Assunto").fill("Uma nova conversa");
      await page.getByLabel("Sua mensagem").fill("Uma mensagem de teste");
      await page.getByRole("button", { name: "Enviar mensagem" }).click();
      await page.getByText("Mensagem registrada no suporte interno.").waitFor();
      assert.equal(state.newConversations, 1);
      assert.equal(state.lastMessage.conversation_id, "new-conversation-1");
    },
  );
  await scenario(
    "pending send cannot erase a newly edited draft",
    async ({ page, state }) => {
      await page.goto("http://127.0.0.1:5174/suporte");
      await page.getByLabel("Assunto").fill("Mensagem em andamento");
      await page.getByLabel("Sua mensagem").fill("Mensagem A");
      state.delay = true;
      await page.getByRole("button", { name: "Enviar mensagem" }).click();
      await page.getByRole("button", { name: "Registrando…" }).waitFor();
      const disabled = await page.getByLabel("Sua mensagem").isDisabled();
      state.release?.();
      assert.equal(disabled, true);
    },
  );
  await scenario(
    "native browser history preserves unsent drafts until confirmation",
    async ({ page }) => {
      await page
        .getByRole("link", { name: "Suporte interno", exact: true })
        .click();
      await page.getByLabel("Sua mensagem").fill("Rascunho antes de voltar");
      await page.evaluate(() => history.back());
      await page.getByRole("dialog").waitFor({ timeout: 3000 });
      await page.getByRole("button", { name: "Continuar escrevendo" }).click();
      assert.equal(
        await page.getByLabel("Sua mensagem").inputValue(),
        "Rascunho antes de voltar",
      );
      assert.equal(new URL(page.url()).pathname, "/suporte");
      await page.evaluate(() => history.back());
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Descartar e sair" }).click();
      await page.getByRole("heading", { name: "Olá, TESTE." }).waitFor();
    },
  );
  await writeFile(
    "docs/browser-regression-results.json",
    JSON.stringify({ fixturesOnly: true, checks: results }, null, 2) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => !r.passed)) process.exitCode = 1;
} finally {
  await browser.close();
}
