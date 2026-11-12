import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  query: null as any,
  calls: [] as Array<[string, ...unknown[]]>,
  result: { data: [] as any, error: null as any, count: 0 },
}));
vi.mock("../src/lib/supabase", () => ({
  db: () => ({
    from: (table: string) => {
      fake.calls.push(["from", table]);
      return fake.query;
    },
    rpc: (name: string, args: unknown) => {
      fake.calls.push(["rpc", name, args]);
      return fake.query;
    },
  }),
}));
import {
  listReadings,
  latestReading,
  adminSummary,
  type Device,
} from "../src/features/devices/api";
beforeEach(() => {
  fake.calls = [];
  fake.result = { data: [], error: null, count: 0 };
  fake.query = {
    then: (resolve: any, reject: any) =>
      Promise.resolve(fake.result).then(resolve, reject),
  };
  for (const method of [
    "select",
    "eq",
    "is",
    "gte",
    "lte",
    "order",
    "limit",
    "range",
    "abortSignal",
  ])
    fake.query[method] = (...args: unknown[]) => {
      fake.calls.push([method, ...args]);
      return fake.query;
    };
});
it("requests a bounded ordered page with time and assignment scope and cancellation", async () => {
  const controller = new AbortController();
  await listReadings(
    "device",
    2,
    controller.signal,
    "person",
    { from: "2026-10-19T00:00:00Z", to: "2026-10-19T01:00:00Z" },
    "assignment",
  );
  for (const call of [
    ["eq", "device_id", "device"],
    ["eq", "person_id", "person"],
    ["eq", "assignment_id", "assignment"],
    ["range", 50, 74],
    ["gte", "recorded_at", "2026-10-19T00:00:00.000Z"],
    ["lte", "recorded_at", "2026-10-19T01:00:00.000Z"],
    ["abortSignal", controller.signal],
  ])
    expect(fake.calls).toContainEqual(call);
  expect(fake.calls).toContainEqual([
    "order",
    "recorded_at",
    { ascending: false },
  ]);
  expect(fake.calls).toContainEqual(["order", "id", { ascending: false }]);
});
it("rejects invalid page/range before sending a request", async () => {
  await expect(listReadings("device", -1)).rejects.toThrow();
  await expect(
    listReadings("device", 0, undefined, null, { from: "invalid" }),
  ).rejects.toThrow();
  expect(fake.calls).toEqual([]);
});
it("returns no latest reading without inventing values and propagates failure", async () => {
  const device = {
    id: "device",
    person_id: "person",
    assignment_id: "assignment",
  } as Device;
  expect(await latestReading(device)).toBeNull();
  expect(fake.calls).toContainEqual(["limit", 1]);
  expect(fake.calls).toContainEqual(["eq", "assignment_id", "assignment"]);
  fake.result.error = new Error("database unavailable");
  await expect(latestReading(device)).rejects.toThrow("database unavailable");
});
it("obtains admin indicators only through the authorized RPC", async () => {
  fake.result.data = {
    active_users: 1,
    caregivers: 1,
    devices: 2,
    recent_devices: 1,
    recent_alerts: 0,
    enabled_devices: 1,
    disabled_devices: 1,
    recent_readings: 3,
    open_alerts: 0,
    generated_at: "2026-10-19T12:00:00Z",
  };
  const summary = await adminSummary(24, 15);
  expect(summary.recent_readings).toBe(3);
  expect(fake.calls).toContainEqual([
    "rpc",
    "admin_dashboard",
    { p_active_hours: 24, p_stale_seconds: 15 },
  ]);
  expect(fake.calls.some(([method]) => method === "from")).toBe(false);
  fake.result.data = null;
  await expect(adminSummary(24, 15)).rejects.toThrow();
});
