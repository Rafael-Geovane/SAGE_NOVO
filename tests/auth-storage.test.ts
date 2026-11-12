import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createAuthStorage,
  isExplicitAuthCallback,
} from "../src/lib/auth-storage";

const storageKey = "sb-offline-audit-auth-token";
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const session = {
  access_token: "offline-fixture-token",
  refresh_token: "offline-fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "offline-user", aud: "authenticated" },
};

describe("app-owned auth storage", () => {
  it("boots the public client in Node with configured fixture env and no DOM", async () => {
    expect(typeof window).toBe("undefined");
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54399");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-fixture-only");
    const transport = vi.fn(async () => {
      throw new Error("Network forbidden");
    });
    vi.stubGlobal("fetch", transport);
    let client: (typeof import("../src/lib/supabase"))["supabase"] = null;
    try {
      const module = await import("../src/lib/supabase");
      client = module.supabase;
      expect(module.configured).toBe(true);
      expect(module.authStorage).toBeNull();
      expect(client).not.toBeNull();
      expect((await client!.auth.getSession()).data.session).toBeNull();
      expect(transport).not.toHaveBeenCalled();
    } finally {
      await client?.auth.stopAutoRefresh();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it.each([
    ["/auth#access_token=fixture&refresh_token=fixture&type=recovery", true],
    ["/auth?access_token=fixture&refresh_token=fixture&type=signup", true],
    ["/auth?code=offline-pkce-fixture", true],
    ["/auth?mode=update", false],
    ["/auth?code=", false],
    ["/auth#access_token=fixture&type=recovery", false],
    ["/caregiver?code=offline-pkce-fixture", false],
    [
      "/caregiver#access_token=fixture&refresh_token=fixture&type=recovery",
      false,
    ],
  ])("only admits an explicit Auth route callback: %s", (path, expected) => {
    expect(isExplicitAuthCallback(`http://127.0.0.1:5174${path}`)).toBe(
      expected,
    );
  });

  it("admits recovery before SDK initialization without deleting its PKCE verifier", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    await storage.signOut({
      stopAutoRefresh: async () => {},
      signOut: async () => ({ error: null }),
    });
    const stale = createAuthStorage(storageKey, backend);
    backend.setItem(
      `${storageKey}-code-verifier`,
      "offline-verifier/PASSWORD_RECOVERY",
    );
    storage.acceptRedirect();
    expect(storage.isSignedOut()).toBe(false);
    expect(storage.storage.getItem(`${storageKey}-code-verifier`)).toBe(
      "offline-verifier/PASSWORD_RECOVERY",
    );
    storage.storage.setItem(storageKey, JSON.stringify(session));
    stale.storage.setItem(storageKey, "stale-refresh");
    expect(storage.storage.getItem(storageKey)).toBe(JSON.stringify(session));
  });

  it("fences storage synchronously while SDK cleanup is still pending", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    backend.setItem(storageKey, JSON.stringify(session));
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loggingOut = storage.signOut({
      stopAutoRefresh: () => waiting,
      signOut: async () => ({ error: null }),
    });
    expect(storage.isSignedOut()).toBe(true);
    expect(backend.getItem(storageKey)).toBeNull();
    storage.storage.setItem(storageKey, JSON.stringify(session));
    expect(storage.storage.getItem(storageKey)).toBeNull();
    release();
    await loggingOut;
  });

  it("keeps a controller created during logout fenced after an explicit new login", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    const auth = {
      stopAutoRefresh: async () => {},
      startAutoRefresh: async () => {},
      signOut: async () => ({ error: null }),
    };
    await storage.signOut(auth);
    const stale = createAuthStorage(storageKey, backend);
    await storage.signIn(auth, async () =>
      storage.storage.setItem(storageKey, "new-session"),
    );
    stale.storage.setItem(storageKey, "stale-refresh");
    stale.storage.removeItem(storageKey);
    expect(storage.storage.getItem(storageKey)).toBe("new-session");
    expect(stale.isSignedOut()).toBe(true);
  });

  it("does not let a queued sign-in reopen storage after a newer logout", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstLogout = storage.signOut({
      stopAutoRefresh: () => waiting,
      signOut: async () => ({ error: null }),
    });
    const auth = {
      stopAutoRefresh: async () => {},
      startAutoRefresh: async () => {},
      signOut: async () => ({ error: null }),
    };
    let entered = false;
    const signingIn = storage
      .signIn(auth, async () => {
        entered = true;
      })
      .catch((error: unknown) => error);
    const lastLogout = storage.signOut(auth);
    release();
    await firstLogout;
    expect(await signingIn).toBeInstanceOf(Error);
    await lastLogout;
    expect(entered).toBe(false);
    expect(storage.isSignedOut()).toBe(true);
  });

  it("clears only app session keys even when public SDK cleanup fails", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    for (const suffix of ["", "-user", "-code-verifier"])
      backend.setItem(storageKey + suffix, "fixture");
    backend.setItem("unrelated-cart", "keep");
    await storage.signOut({
      stopAutoRefresh: async () => {},
      signOut: async () => ({ error: new Error("Auth unreachable") }),
    });
    for (const suffix of ["", "-user", "-code-verifier"])
      expect(backend.getItem(storageKey + suffix)).toBeNull();
    expect(backend.getItem("unrelated-cart")).toBe("keep");
    expect(storage.isSignedOut()).toBe(true);
  });

  it("blocks delayed SDK writes across controllers and reloads", async () => {
    const backend = memory(),
      first = createAuthStorage(storageKey, backend);
    const otherTab = createAuthStorage(storageKey, backend);
    await first.signOut({
      stopAutoRefresh: async () => {},
      signOut: async () => {
        throw new Error("offline");
      },
    });
    otherTab.storage.setItem(storageKey, JSON.stringify(session));
    const reloaded = createAuthStorage(storageKey, backend);
    expect(reloaded.storage.getItem(storageKey)).toBeNull();
    expect(reloaded.isSignedOut()).toBe(true);
  });

  it("waits for old logout cleanup before admitting an explicit new sign-in", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const auth = {
      stopAutoRefresh: async () => {},
      startAutoRefresh: async () => {},
      signOut: async () => {
        await done;
        return { error: null };
      },
    };
    const loggingOut = storage.signOut(auth);
    let entered = false;
    const signingIn = storage.signIn(auth, async () => {
      entered = true;
      storage.storage.setItem(storageKey, JSON.stringify(session));
    });
    await Promise.resolve();
    expect(entered).toBe(false);
    release();
    await loggingOut;
    await signingIn;
    expect(entered).toBe(true);
    expect(storage.isSignedOut()).toBe(false);
    expect(storage.storage.getItem(storageKey)).toBe(JSON.stringify(session));
  });

  it("uses the installed public SDK with a completely offline transport", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    backend.setItem(storageKey, JSON.stringify(session));
    let calls = 0;
    const sdk = createClient(
      "http://127.0.0.1:54399",
      "offline-public-fixture",
      {
        auth: {
          storageKey,
          storage: storage.storage,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async () => {
            calls++;
            throw new Error("Network forbidden");
          },
        },
      },
    );
    await sdk.auth.getSession();
    await storage.signOut(sdk.auth);
    expect((await sdk.auth.getSession()).data.session).toBeNull();
    expect(backend.getItem(storageKey)).toBeNull();
    expect(calls).toBe(0);
  });

  it("rejects a real SDK refresh response that arrives after local logout", async () => {
    const backend = memory(),
      storage = createAuthStorage(storageKey, backend);
    backend.setItem(storageKey, JSON.stringify(session));
    let respond!: (response: Response) => void, started!: () => void;
    const response = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const sdk = createClient(
      "http://127.0.0.1:54399",
      "offline-public-fixture",
      {
        auth: {
          storageKey,
          storage: storage.storage,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async () => {
            calls++;
            started();
            return response;
          },
        },
      },
    );
    await sdk.auth.getSession();
    const refreshing = sdk.auth.refreshSession();
    await requested;
    const loggingOut = storage.signOut(sdk.auth);
    expect(storage.isSignedOut()).toBe(true);
    respond(
      new Response(
        JSON.stringify({ ...session, access_token: "late-refreshed-token" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    await Promise.all([refreshing, loggingOut]);
    expect((await sdk.auth.getSession()).data.session).toBeNull();
    expect(backend.getItem(storageKey)).toBeNull();
    expect(calls).toBe(1);
  });
});
