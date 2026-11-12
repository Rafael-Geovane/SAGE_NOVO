import { expect, it, vi } from "vitest";
import {
  createWeeklyAnalysisHandler,
  parseAnalysis,
} from "../supabase/functions/weekly-analysis/handler";
const args = {
  device_id: "00000000-0000-4000-8000-000000000001",
  assignment_id: "00000000-0000-4000-8000-000000000002",
  start: "2026-11-10",
  consent: true,
};
const report = {
  start: "2026-11-10",
  end: "2026-11-17",
  timezone: "UTC",
  sources: [{ source: "simulated", samples: 3 }],
  days: [],
  metrics: [],
  events: [],
  device_code: "PRIVATE",
  assignment_id: args.assignment_id,
};
const output = {
  summary: "Registros simulados da semana.",
  observations: ["Três amostras simuladas."],
  improvements: ["Conferir cobertura."],
  attention: ["Verificar eventos no sino."],
};
const reply = () =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(output) } },
      ],
    }),
  );
function setup(overrides: Record<string, unknown> = {}) {
  const deps = {
    apiKey: "server-only-test-key",
    authorize: vi.fn(async () => ({ report })),
    reserve: vi.fn(async () => true),
    reauthorize: vi.fn(async () => true),
    fetcher: vi.fn(async () => reply()),
    ...overrides,
  };
  return { deps, handler: createWeeklyAnalysisHandler(deps) };
}
const request = (value: unknown = args, token = "test-jwt") =>
  new Request("https://local/weekly-analysis", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(value),
  });
it("requires authentication and explicit consent before authorization/provider calls", async () => {
  const { deps, handler } = setup();
  expect((await handler(request(args, ""))).status).toBe(401);
  expect((await handler(request({ ...args, consent: false }))).status).toBe(
    400,
  );
  expect(deps.fetcher).not.toHaveBeenCalled();
});
it("denies missing Premium or device permission", async () => {
  const { deps, handler } = setup({ authorize: async () => null });
  expect((await handler(request())).status).toBe(403);
  expect(deps.fetcher).not.toHaveBeenCalled();
});
it("reports missing server key without pretending to have generated AI", async () => {
  const { handler } = setup({ apiKey: undefined });
  const r = await handler(request());
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: "nvidia_not_configured" });
});
it("sends aggregates only, constrains the prompt, and returns generated provenance", async () => {
  const { deps, handler } = setup();
  const response = await handler(request());
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.mode).toBe("nvidia");
  expect(result.summary).toBe(output.summary);
  expect(result.health_status).toContain("não permitem confirmar");
  const sent = deps.fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(sent[0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
  expect(sent[1].body).not.toContain("PRIVATE");
  expect(sent[1].body).not.toContain(args.assignment_id);
  expect(sent[1].body).toContain("Nunca afirme que a pessoa está bem");
  expect(JSON.stringify(result)).not.toContain("server-only-test-key");
});
it("rejects empty weeks and rate limits before provider calls", async () => {
  const noData = setup({
    authorize: async () => ({ report: { ...report, sources: [] } }),
  });
  expect((await noData.handler(request())).status).toBe(422);
  expect(noData.deps.fetcher).not.toHaveBeenCalled();
  const limited = setup({ reserve: async () => false });
  expect((await limited.handler(request())).status).toBe(429);
  expect(limited.deps.fetcher).not.toHaveBeenCalled();
});
it("drops generated content if access changes during generation", async () => {
  const { handler } = setup({ reauthorize: async () => false });
  const r = await handler(request());
  expect(r.status).toBe(403);
  expect(await r.text()).not.toContain(output.summary);
});
it("handles provider throttling, incomplete responses and invalid JSON safely", async () => {
  for (const [upstream, status] of [
    [new Response("private upstream detail", { status: 429 }), 429],
    [
      new Response(JSON.stringify({ choices: [{ finish_reason: "length" }] })),
      502,
    ],
    [new Response("invalid JSON"), 502],
  ] as const) {
    const { handler } = setup({ fetcher: async () => upstream });
    const r = await handler(request());
    expect(r.status).toBe(status);
    expect(await r.text()).not.toContain("private upstream detail");
  }
});
it("validates lists and rejects oversized provider content", () => {
  expect(() =>
    parseAnalysis(JSON.stringify({ ...output, improvements: "invalid" })),
  ).toThrow();
  expect(() => parseAnalysis("x".repeat(16001))).toThrow();
});
