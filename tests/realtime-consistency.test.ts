import { afterEach, describe, expect, it } from "vitest";
import { isCancelledError, QueryClient } from "@tanstack/react-query";
import * as realtime from "../src/features/devices/realtime";
import type { Reading } from "../src/features/devices/api";

const scope = { deviceId: "vest", personId: "person", assignmentId: "first" };
const key = ["readings", "user", "vest", "person", "first", 0];
const clients: QueryClient[] = [];
function cache() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function row(id: number): Reading {
  return {
    id,
    device_id: scope.deviceId,
    person_id: scope.personId,
    assignment_id: scope.assignmentId,
    recorded_at: new Date(1700000000000 + id * 1000).toISOString(),
    received_at: "2026-10-22T00:00:00Z",
    metrics: { battery_percent: null },
    event: null,
  };
}
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("history consistency with the installed QueryClient", () => {
  it.each([
    ["2026-10-26T12:00:00.000100Z", [1, 2]],
    ["2026-10-26T09:00:00.000100-03:00", [1, 2]],
    ["2026-10-26T09:00:00.000900-03:00", [2, 1]],
    ["2026-10-26T12:00:00.0009Z", [2, 1]],
  ])(
    "orders sub-millisecond timestamps before IDs: %s",
    (recorded_at, expected) => {
      const newer = { ...row(1), recorded_at: "2026-10-26T12:00:00.000900Z" };
      const result = realtime.mergeReadingPage(
        { rows: [newer], count: 1 },
        { ...row(2), recorded_at },
        scope,
      )!;
      expect(result.rows.map((reading) => reading.id)).toEqual(expected);
    },
  );

  it("evicts previously selected scopes while keeping a newly selected assignment", async () => {
    const client = cache(),
      response = deferred<realtime.ReadingPage>();
    const currentScope = { ...scope, assignmentId: "second" };
    const current = ["readings", "user", "vest", "person", "second", 0];
    const oldOther = [
      "alerts",
      "user",
      "previous-vest",
      "previous-person",
      "old",
      "",
      2,
    ];
    client.setQueryData(current, { rows: [], count: 0 });
    client.setQueryData(oldOther, { rows: [{ id: "sensitive" }], count: 1 });
    let signal!: AbortSignal;
    const fetching = client
      .fetchQuery({
        queryKey: key,
        queryFn: (context) => {
          signal = context.signal;
          return response.promise;
        },
      })
      .catch((error: unknown) => error);
    realtime.reconcileTelemetryScope(client, "user", currentScope);
    expect(signal.aborted).toBe(true);
    expect(client.getQueryData(oldOther)).toBeUndefined();
    expect(client.getQueryData(current)).toBeDefined();
    response.resolve({ rows: [row(1)], count: 1 });
    expect(isCancelledError(await fetching)).toBe(true);
    realtime.reconcileTelemetryScope(client, "user");
    expect(client.getQueriesData({ queryKey: ["readings", "user"] })).toEqual(
      [],
    );
  });

  it("does not reuse a cancelled stream buffer for the next HTTP snapshot", async () => {
    const stream = realtime.createReadingStream(scope),
      response = deferred<realtime.ReadingPage>();
    const controller = new AbortController();
    const cancelled = stream
      .read(() => response.promise, controller.signal)
      .catch((error: unknown) => error);
    stream.push(row(2));
    controller.abort();
    response.resolve({ rows: [row(1)], count: 1 });
    expect(await cancelled).toBeInstanceOf(Error);
    const result = await stream.read(async () => ({
      rows: [row(1)],
      count: 1,
    }));
    expect(result.rows.map((reading) => reading.id)).toEqual([1]);
    expect(result.countExact).toBe(true);
  });

  it("does not invent counts when an old off-page delivery repeats", () => {
    let page: realtime.ReadingPage = {
      rows: Array.from({ length: 25 }, (_, i) => row(50 - i)),
      count: 50,
    };
    page = realtime.mergeReadingPage(page, row(1), scope)!;
    page = realtime.mergeReadingPage(page, row(1), scope)!;
    expect(page.count).toBe(50);
    expect(page.countExact).toBe(false);
    expect(page.rows).toHaveLength(25);
  });

  it.each([false, true])(
    "retains an insert ahead of a delayed HTTP snapshot (cached=%s)",
    async (cached) => {
      const client = cache();
      const stream = realtime.createReadingStream(scope);
      if (cached) client.setQueryData(key, { rows: [row(1)], count: 1 });
      const response = deferred<realtime.ReadingPage>();
      const started = deferred<void>();
      let requests = 0;
      const fetching = client.fetchQuery({
        queryKey: key,
        queryFn: ({ signal }) =>
          stream.read(async () => {
            requests++;
            started.resolve();
            return response.promise;
          }, signal),
      });
      await started.promise;
      stream.push(row(2));
      client.setQueryData<realtime.ReadingPage>(key, (previous) =>
        realtime.mergeReadingPage(previous, row(2), scope),
      );
      response.resolve({ rows: [row(1)], count: 1 });
      await fetching;
      const result = client.getQueryData<realtime.ReadingPage>(key)!;
      expect(result.rows.map((r) => r.id)).toEqual([2, 1]);
      expect(result.rows[0].metrics.battery_percent).toBeNull();
      expect(result.count).toBe(2);
      expect(requests).toBe(1);
    },
  );

  it("deduplicates inserts already included in the HTTP snapshot", async () => {
    const client = cache(),
      stream = realtime.createReadingStream(scope);
    const response = deferred<realtime.ReadingPage>();
    const fetching = client.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => stream.read(() => response.promise, signal),
    });
    stream.push(row(2));
    stream.push(row(2));
    stream.push({ ...row(3), assignment_id: "foreign" });
    response.resolve({ rows: [row(2), row(1)], count: 2 });
    await fetching;
    expect(client.getQueryData<realtime.ReadingPage>(key)!.count).toBe(2);
    expect(
      client.getQueryData<realtime.ReadingPage>(key)!.rows.map((r) => r.id),
    ).toEqual([2, 1]);
  });

  it("bounds a long fetch burst and marks its count as uncertain", async () => {
    const client = cache(),
      stream = realtime.createReadingStream(scope);
    const response = deferred<realtime.ReadingPage>();
    const fetching = client.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => stream.read(() => response.promise, signal),
    });
    for (let id = 1; id <= 100; id++) stream.push(row(id));
    response.resolve({ rows: [], count: 0 });
    await fetching;
    const result = client.getQueryData<realtime.ReadingPage>(key)!;
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0].id).toBe(100);
    expect(result.rows.at(-1)!.id).toBe(76);
    expect(result.countExact).toBe(false);
    expect(result.count).toBeLessThanOrEqual(100);
  });

  it.each(["reassignment", "revocation", "selection change"])(
    "cancels and removes every old sensitive page after %s",
    async () => {
      const client = cache(),
        response = deferred<realtime.ReadingPage>();
      const stream = realtime.createReadingStream(scope);
      client.setQueryData(key, { rows: [row(1)], count: 1 });
      client.setQueryData([...key.slice(0, -1), 1], {
        rows: [row(2)],
        count: 2,
      });
      const alertKey = ["alerts", "user", "vest", "person", "first", "", 0];
      client.setQueryData(alertKey, { rows: [{ id: "old-alert" }], count: 1 });
      const other = ["readings", "other-user", "vest", "person", "first", 0];
      client.setQueryData(other, { rows: [row(1)], count: 1 });
      let signal!: AbortSignal;
      const fetching = client
        .fetchQuery({
          queryKey: key,
          queryFn: (context) => {
            signal = context.signal;
            return stream.read(() => response.promise, signal);
          },
        })
        .catch((error: unknown) => error);
      client.setQueryData(["devices", "user", 0], { rows: [], count: 0 });
      realtime.clearTelemetryScope(client, "user", "vest");
      expect(signal.aborted).toBe(true);
      response.resolve({ rows: [row(1)], count: 1 });
      expect(isCancelledError(await fetching)).toBe(true);
      expect(
        client.getQueriesData({ queryKey: ["readings", "user", "vest"] }),
      ).toEqual([]);
      expect(client.getQueryData(alertKey)).toBeUndefined();
      expect(client.getQueryData(other)).toBeDefined();
    },
  );

  it("resets the requested page before a changed assignment can fetch", () => {
    const previous = { scope: "vest:person:first", page: 3 };
    expect(realtime.scopeHistoryPage(previous, "vest:person:second")).toEqual({
      scope: "vest:person:second",
      page: 0,
    });
    expect(realtime.scopeHistoryPage(previous, "other:person:first").page).toBe(
      0,
    );
    expect(realtime.scopeHistoryPage(previous, "").page).toBe(0);
    expect(realtime.scopeHistoryPage(previous, previous.scope)).toBe(previous);
  });
});
