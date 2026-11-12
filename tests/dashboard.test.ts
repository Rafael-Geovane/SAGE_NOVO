import { describe, expect, it } from "vitest";
import {
  mergeReadingPage,
  historyWindow,
  shareAuthorization,
} from "../src/features/devices/realtime";

const scope = {
  deviceId: "vest",
  personId: "person",
  assignmentId: "assignment",
};
it("shares a pending authorization result with a reconnect instead of skipping reconciliation", async () => {
  let calls = 0;
  let release!: (allowed: boolean) => void;
  const authorize = shareAuthorization(() => {
    calls++;
    return new Promise<boolean>((resolve) => {
      release = resolve;
    });
  });
  const periodic = authorize(),
    reconnect = authorize();
  await Promise.resolve();
  expect(calls).toBe(1);
  release(true);
  expect(await periodic).toBe(true);
  expect(await reconnect).toBe(true);
  const next = authorize();
  await Promise.resolve();
  expect(calls).toBe(2);
  release(false);
  expect(await next).toBe(false);
});
const row = {
  id: 2,
  device_id: "vest",
  person_id: "person",
  assignment_id: "assignment",
  recorded_at: "2026-10-19T12:00:02Z",
  received_at: "2026-10-19T12:00:03Z",
  metrics: { battery_percent: null },
  event: null,
};
describe("bounded realtime cache", () => {
  it("ignores other devices, people and previous assignments", () => {
    const previous = { rows: [], count: 0 };
    for (const patch of [
      { device_id: "other" },
      { person_id: "other" },
      { assignment_id: "old" },
    ]) {
      expect(mergeReadingPage(previous, { ...row, ...patch }, scope)).toBe(
        previous,
      );
    }
    expect(mergeReadingPage(previous, { ...row, metrics: null }, scope)).toBe(
      previous,
    );
  });
  it("deduplicates, orders late messages and bounds the page without filling nulls", () => {
    const first = mergeReadingPage({ rows: [], count: 0 }, row, scope)!;
    expect(first.rows[0].metrics.battery_percent).toBeNull();
    expect(mergeReadingPage(first, row, scope)).toBe(first);
    const later = mergeReadingPage(
      first,
      { ...row, id: 3, recorded_at: "2026-10-19T12:00:01Z" },
      scope,
    )!;
    expect(later.rows.map((r) => r.id)).toEqual([2, 3]);
    let page = later;
    for (let id = 4; id <= 35; id++)
      page = mergeReadingPage(page, { ...row, id }, scope)!;
    expect(page.rows).toHaveLength(25);
    expect(page.count).toBe(34);
    expect(mergeReadingPage(undefined, row, scope)).toBeUndefined();
  });
});
it("validates history ranges before a request and normalizes UTC", () => {
  expect(
    historyWindow({
      from: "2026-10-19T09:00:00-03:00",
      to: "2026-10-19T13:00:00Z",
    }),
  ).toEqual({
    from: "2026-10-19T12:00:00.000Z",
    to: "2026-10-19T13:00:00.000Z",
  });
  expect(() => historyWindow({ from: "bad" })).toThrow();
  expect(() =>
    historyWindow({ from: "2026-10-20T00:00:00Z", to: "2026-10-19T00:00:00Z" }),
  ).toThrow();
  expect(() => historyWindow({ from: "2026-10-19" })).toThrow();
});
