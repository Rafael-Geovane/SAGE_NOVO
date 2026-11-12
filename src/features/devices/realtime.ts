import type { Reading } from "./api";
import type { QueryClient, Query } from "@tanstack/react-query";

export function shareAuthorization(check: () => Promise<boolean>) {
  let pending: Promise<boolean> | null = null;
  return () => {
    pending ??= Promise.resolve()
      .then(check)
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

export type HistoryRange = { from?: string; to?: string };
export function historyWindow(range: HistoryRange = {}): HistoryRange {
  const utc = (value?: string) => {
    if (value === undefined) return undefined;
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new Error("Informe um intervalo de datas válido com fuso horário.");
    return new Date(value).toISOString();
  };
  const from = utc(range.from),
    to = utc(range.to);
  if (from && to && from > to)
    throw new Error("O início deve anteceder o fim do intervalo.");
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

export type ReadingPage = {
  rows: Reading[];
  count: number;
  countExact?: boolean;
};
export type AssignmentScope = {
  deviceId: string;
  personId: string | null;
  assignmentId: string;
};
function scopedReading(input: unknown, scope: AssignmentScope): Reading | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Reading;
  if (
    row.device_id !== scope.deviceId ||
    row.person_id !== scope.personId ||
    row.assignment_id !== scope.assignmentId ||
    !Number.isSafeInteger(row.id) ||
    row.id < 1 ||
    !Number.isFinite(Date.parse(row.recorded_at)) ||
    !Number.isFinite(Date.parse(row.received_at)) ||
    !row.metrics ||
    typeof row.metrics !== "object" ||
    Array.isArray(row.metrics)
  )
    return null;
  return row;
}
function subMillisecond(timestamp: string) {
  const fraction =
    timestamp.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] ?? "";
  return Number(`0.${fraction.slice(3)}`);
}
const orderReadings = (x: Reading, y: Reading) =>
  Date.parse(y.recorded_at) - Date.parse(x.recorded_at) ||
  // PostgreSQL preserves microseconds; Date.parse only preserves milliseconds.
  subMillisecond(y.recorded_at) - subMillisecond(x.recorded_at) ||
  y.id - x.id;

export function mergeReadingPage(
  previous: ReadingPage | undefined,
  input: unknown,
  scope: AssignmentScope,
): ReadingPage | undefined {
  const row = scopedReading(input, scope);
  if (!previous || !row) return previous;
  if (previous.rows.some((r) => r.id === row.id)) return previous;
  const rows = [...previous.rows, row].sort(orderReadings).slice(0, 25);
  // An unseen off-page ID may be a replay. Only a complete page or an insert
  // inside its ordered window proves that the snapshot did not include it.
  const provenNew =
    (previous.count === previous.rows.length &&
      previous.countExact !== false) ||
    (previous.rows.length > 0 &&
      orderReadings(row, previous.rows[previous.rows.length - 1]) < 0);
  return {
    rows,
    count: Math.max(rows.length, previous.count + (provenNew ? 1 : 0)),
    countExact: provenNew ? previous.countExact !== false : false,
  };
}

export function createReadingStream(scope: AssignmentScope) {
  const pending = new Set<{ rows: Reading[]; overflow: boolean }>();
  return {
    push(input: unknown) {
      const row = scopedReading(input, scope);
      if (!row) return;
      for (const buffer of pending) {
        if (buffer.rows.some((item) => item.id === row.id)) continue;
        buffer.rows.push(row);
        if (buffer.rows.length > 25) buffer.overflow = true;
        buffer.rows = buffer.rows.sort(orderReadings).slice(0, 25);
      }
    },
    async read(
      fetchPage: () => Promise<ReadingPage>,
      signal?: AbortSignal,
    ): Promise<ReadingPage> {
      signal?.throwIfAborted();
      const buffer = { rows: [] as Reading[], overflow: false };
      pending.add(buffer);
      const discard = () => {
        pending.delete(buffer);
        buffer.rows = [];
      };
      signal?.addEventListener("abort", discard, { once: true });
      try {
        let result = await fetchPage();
        signal?.throwIfAborted();
        for (const row of buffer.rows)
          result = mergeReadingPage(result, row, scope)!;
        return {
          ...result,
          countExact: !buffer.overflow && result.countExact !== false,
        };
      } finally {
        discard();
        signal?.removeEventListener("abort", discard);
      }
    },
  };
}

function clearSensitiveQueries(
  client: QueryClient,
  predicate: (query: Query) => boolean,
) {
  const filters = { predicate };
  void client.cancelQueries(filters, { revert: false });
  client.removeQueries(filters);
}
function sensitiveFor(query: Query, userId: string) {
  return (
    (query.queryKey[0] === "readings" ||
      query.queryKey[0] === "alerts" ||
      query.queryKey[0] === "elder-profile") &&
    query.queryKey[1] === userId
  );
}
function matchesScope(query: Query, scope: AssignmentScope) {
  return (
    query.queryKey[2] === scope.deviceId &&
    query.queryKey[3] === scope.personId &&
    query.queryKey[4] === scope.assignmentId
  );
}
export function clearTelemetryScope(
  client: QueryClient,
  userId: string,
  deviceId?: string,
  scope?: AssignmentScope,
) {
  clearSensitiveQueries(
    client,
    (query) =>
      sensitiveFor(query, userId) &&
      (deviceId === undefined || query.queryKey[2] === deviceId) &&
      (!scope || matchesScope(query, scope)),
  );
}
export function reconcileTelemetryScope(
  client: QueryClient,
  userId: string,
  scope?: AssignmentScope,
) {
  clearSensitiveQueries(
    client,
    (query) =>
      sensitiveFor(query, userId) && (!scope || !matchesScope(query, scope)),
  );
}
export function scopeHistoryPage(
  previous: { scope: string; page: number },
  scope: string,
) {
  return previous.scope === scope ? previous : { scope, page: 0 };
}
