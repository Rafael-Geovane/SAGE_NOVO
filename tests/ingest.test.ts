import { describe, it, expect, vi } from "vitest";
import { createIngestHandler } from "../supabase/functions/ingest/handler";
const p = {
  schema_version: 1,
  message_id: "b7c77d14-7f70-4de5-a355-bc62733d2077",
  device_code: "SGE-001",
  recorded_at: "2026-10-16T12:00:00Z",
  metrics: { battery_percent: 50 },
};
function request(body: unknown = p, token = "a".repeat(40)) {
  return new Request("https://local.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": token },
    body: JSON.stringify(body),
  });
}
describe("ingestion HTTP boundary", () => {
  it.each([
    "sb_secret_" + "x".repeat(40),
    "sb_publishable_" + "x".repeat(40),
    "sbp_" + "x".repeat(40),
    "eyJhbGciOiJIUzI1NiJ9." + "x".repeat(40) + ".signature",
    "a".repeat(20) + " " + "a".repeat(20),
    "a".repeat(20) + "/" + "a".repeat(20),
    "a".repeat(31),
    "a".repeat(257),
  ])(
    "rejects a project credential or malformed device token before storage (%#)",
    async (token) => {
      const store = vi
        .fn()
        .mockResolvedValue({ status: 200, accepted: true, duplicate: false });
      const res = await createIngestHandler({
        store,
        now: () => new Date(p.recorded_at),
      })(request(p, token));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
      expect(store).not.toHaveBeenCalled();
    },
  );

  it.each(["a".repeat(32), "a_1-".repeat(64)])(
    "accepts bounded individual device token syntax (%#)",
    async (token) => {
      const store = vi
        .fn()
        .mockResolvedValue({ status: 200, accepted: true, duplicate: false });
      const res = await createIngestHandler({
        store,
        now: () => new Date(p.recorded_at),
      })(request(p, token));
      expect(res.status).toBe(200);
      expect(store).toHaveBeenCalledOnce();
    },
  );

  it("rejects missing token before storage", async () => {
    const store = vi.fn();
    const h = createIngestHandler({
      store,
      now: () => new Date(p.recorded_at),
    });
    expect((await h(request(p, ""))).status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });
  it("rejects invalid payload before storage", async () => {
    const store = vi.fn();
    expect(
      (
        await createIngestHandler({
          store,
          now: () => new Date(p.recorded_at),
        })(request({ ...p, metrics: { battery_percent: "x" } }))
      ).status,
    ).toBe(400);
    expect(store).not.toHaveBeenCalled();
  });
  it.each([
    { status: 200, accepted: true, duplicate: false },
    { status: 400, error: "reading_predates_assignment" },
    { status: 401, error: "unauthorized" },
    { status: 403, error: "device_disabled" },
    { status: 409, error: "idempotency_conflict" },
    { status: 429, error: "rate_limited" },
  ])("returns repository result %j", async (result) => {
    const store = vi.fn().mockResolvedValue({
      ...result,
    });
    expect(
      (
        await createIngestHandler({
          store,
          now: () => new Date(p.recorded_at),
        })(request())
      ).status,
    ).toBe(result.status);
    expect(store.mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
    expect(store.mock.calls[0][1]).not.toContain("aaaa");
  });
  it("returns duplicate as success", async () => {
    const res = await createIngestHandler({
      store: async () => ({ status: 200, accepted: true, duplicate: true }),
      now: () => new Date(p.recorded_at),
    })(request());
    expect((await res.json()).duplicate).toBe(true);
  });
  it("hides persistence errors", async () => {
    const h = createIngestHandler({
      store: async () => {
        throw new Error("SECRET");
      },
      now: () => new Date(p.recorded_at),
    });
    const res = await h(request());
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("SECRET");
  });
  it("bounds request size even without content-length", async () =>
    expect(
      (
        await createIngestHandler({ store: vi.fn() })(
          request({ data: "x".repeat(17000) }),
        )
      ).status,
    ).toBe(413));

  it.each([
    ["application/jsonp", 415],
    ["text/plain; application/json", 415],
    ["Application/JSON; charset=utf-8", 200],
  ])("checks the exact media type %s", async (contentType, status) => {
    const req = request();
    req.headers.set("Content-Type", contentType);
    const res = await createIngestHandler({
      store: async () => ({ status: 200, accepted: true, duplicate: false }),
      now: () => new Date(p.recorded_at),
    })(req);
    expect(res.status).toBe(status);
  });

  it.each([
    { maxBodyBytes: NaN },
    { maxBodyBytes: 0 },
    { maxBodyBytes: 65537 },
    { bodyReadTimeoutMs: Infinity },
    { bodyReadTimeoutMs: 0 },
    { storeTimeoutMs: 30001 },
    { storeTimeoutMs: 1.5 },
    { config: { maxFutureSeconds: NaN, maxAgeDays: 7 } },
  ])("rejects invalid runtime configuration %j", (options) => {
    expect(() => createIngestHandler({ store: vi.fn(), ...options })).toThrow();
  });

  it.each([
    null,
    { status: 200 },
    { status: 200, accepted: false, duplicate: false },
    { status: 200, accepted: true, duplicate: false, error: "write_failed" },
    { status: 200, accepted: true, duplicate: false, received_at: "bad-date" },
    { status: 201, accepted: true, duplicate: false },
    { status: 401, error: "SECRET database details" },
    { status: 503, error: "SECRET database details" },
  ])("rejects malformed storage result %j", async (result) => {
    const res = await createIngestHandler({
      store: vi.fn().mockResolvedValue(result),
      now: () => new Date(p.recorded_at),
    })(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "temporarily_unavailable" });
  });

  it("only exposes whitelisted storage response fields", async () => {
    const res = await createIngestHandler({
      store: async () => ({
        status: 200,
        accepted: true,
        duplicate: false,
        token: "SECRET",
        person: { name: "PRIVATE" },
      }),
      now: () => new Date(p.recorded_at),
    })(request());
    expect(await res.json()).toEqual({ accepted: true, duplicate: false });
  });

  it("assigns safe request IDs and redacted outcomes even when authentication fails", async () => {
    const events: unknown[] = [];
    const req = request(p, "");
    req.headers.set("X-Request-ID", "untrusted-client-value");
    const res = await createIngestHandler({
      store: vi.fn(),
      log: (event) => events.push(event),
    })(req);
    expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
    expect(events).toEqual([
      {
        request_id: res.headers.get("X-Request-ID"),
        status: 401,
        outcome: "unauthorized",
        duration_ms: expect.any(Number),
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /SGE-001|b7c77d14|untrusted-client/,
    );
  });

  it("does not let an unavailable logger fail a valid request", async () => {
    const res = await createIngestHandler({
      store: async () => ({ status: 200, accepted: true, duplicate: true }),
      now: () => new Date(p.recorded_at),
      log: () => {
        throw new Error("logger failed");
      },
    })(request());
    expect(res.status).toBe(200);
  });

  it("returns Allow: POST for unsupported methods", async () => {
    const res = await createIngestHandler({ store: vi.fn() })(
      new Request("https://local.test", { method: "GET" }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it.each(["{broken", new Uint8Array([0xff, 0xfe])])(
    "rejects malformed JSON or UTF-8 before storage: %j",
    async (body) => {
      const store = vi.fn();
      const req = new Request("https://local.test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": "a".repeat(40),
        },
        body,
      });
      const res = await createIngestHandler({ store })(req);
      expect(res.status).toBe(400);
      expect(store).not.toHaveBeenCalled();
    },
  );

  it("rejects excessive content-length before reading", async () => {
    const req = request();
    req.headers.set("Content-Length", "16385");
    const store = vi.fn();
    const res = await createIngestHandler({ store })(req);
    expect(res.status).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it("returns Retry-After and never caches rate limit responses", async () => {
    const res = await createIngestHandler({
      store: async () => ({ status: 429, error: "rate_limited" }),
      now: () => new Date(p.recorded_at),
    })(request());
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("bounds a stalled request body without waiting for cancellation", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    try {
      const body = new ReadableStream({
        cancel() {
          cancelled = true;
          return new Promise<void>(() => {});
        },
      });
      const req = new Request("https://local.test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": "a".repeat(40),
        },
        body,
        duplex: "half",
      } as RequestInit);
      const pending = createIngestHandler({
        store: vi.fn(),
        bodyReadTimeoutMs: 10,
      })(req);
      await vi.advanceTimersByTimeAsync(11);
      const res = await pending;
      expect(res.status).toBe(408);
      expect(await res.json()).toEqual({ error: "request_timeout" });
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts stalled storage and returns a retryable response", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const startedStore = new Promise<void>((resolve) => {
      started = resolve;
    });
    try {
      const pending = createIngestHandler({
        store: async (_payload, _hash, abortSignal) => {
          signal = abortSignal;
          started();
          return new Promise(() => {});
        },
        now: () => new Date(p.recorded_at),
        storeTimeoutMs: 10,
      })(request());
      await startedStore;
      await vi.advanceTimersByTimeAsync(11);
      const res = await pending;
      expect(res.status).toBe(503);
      expect(signal?.aborted).toBe(true);
      expect(await res.json()).toEqual({ error: "temporarily_unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });
});
