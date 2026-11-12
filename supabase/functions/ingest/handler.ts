import {
  DEFAULT_INGEST_CONFIG,
  validateIngestConfig,
  validateTelemetry,
  type TelemetryPayload,
  type IngestConfig,
} from "../../../src/domain/telemetry.ts";

export type IngestResult = {
  status: number;
  accepted?: boolean;
  duplicate?: boolean;
  received_at?: string;
  error?: string;
};
export type IngestLogEvent = {
  request_id: string;
  status: number;
  outcome: string;
  duration_ms: number;
};
export type IngestDependencies = {
  store: (
    payload: TelemetryPayload,
    hash: string,
    signal: AbortSignal,
  ) => Promise<IngestResult>;
  now?: () => Date;
  config?: IngestConfig;
  maxBodyBytes?: number;
  bodyReadTimeoutMs?: number;
  storeTimeoutMs?: number;
  log?: (event: IngestLogEvent) => void;
};

class DeadlineError extends Error {}
class BodySizeError extends Error {}

const boundedInteger = (value: number, maximum: number) => {
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error("invalid_ingest_configuration");
  return value;
};

// A race alone leaves network work running. The signal also cancels the body/RPC.
async function withDeadline<T>(
  milliseconds: number,
  requestSignal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortRequest = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      const abort = () => {
        controller.abort();
        reject(new DeadlineError());
      };
      abortRequest = abort;
      requestSignal.addEventListener("abort", abortRequest, { once: true });
      if (requestSignal.aborted) {
        abort();
        return;
      }
      timer = setTimeout(abort, milliseconds);
      Promise.resolve()
        .then(() => operation(controller.signal))
        .then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    requestSignal.removeEventListener("abort", abortRequest);
  }
}

async function readBody(
  request: Request,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const cancel = () => {
    // A hostile stream can leave cancellation pending; do not await it.
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new DeadlineError();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        cancel();
        throw new BodySizeError();
      }
      if (next.value.byteLength) chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function safeStoreResult(result: IngestResult): IngestResult {
  if (!result || typeof result !== "object")
    throw new Error("invalid_storage_result");
  if (result.status === 200) {
    if (
      result.accepted !== true ||
      typeof result.duplicate !== "boolean" ||
      result.error !== undefined ||
      (result.received_at !== undefined &&
        (typeof result.received_at !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(
            result.received_at,
          ) ||
          !Number.isFinite(Date.parse(result.received_at))))
    )
      throw new Error("invalid_storage_result");
    return {
      status: 200,
      accepted: true,
      duplicate: result.duplicate,
      ...(result.received_at === undefined
        ? {}
        : { received_at: result.received_at }),
    };
  }
  const errors: Record<number, readonly string[]> = {
    400: ["invalid_payload", "reading_predates_assignment"],
    401: ["unauthorized"],
    403: ["device_disabled"],
    409: ["idempotency_conflict"],
    429: ["rate_limited"],
  };
  if (!errors[result.status]?.includes(result.error ?? ""))
    throw new Error("invalid_storage_result");
  return { status: result.status, error: result.error };
}

export function createIngestHandler(deps: IngestDependencies) {
  const config = validateIngestConfig(deps.config ?? DEFAULT_INGEST_CONFIG);
  const limit = boundedInteger(deps.maxBodyBytes ?? 16384, 65536);
  const bodyTimeout = boundedInteger(deps.bodyReadTimeoutMs ?? 5000, 30000);
  const storeTimeout = boundedInteger(deps.storeTimeoutMs ?? 5000, 30000);

  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const respond = (
      status: number,
      data: Omit<IngestResult, "status">,
      outcome?: string,
    ) => {
      try {
        deps.log?.({
          request_id: requestId,
          status,
          outcome:
            outcome ??
            data.error ??
            (data.duplicate ? "duplicate" : "accepted"),
          duration_ms: Math.max(0, Math.round(performance.now() - started)),
        });
      } catch {
        // Logging must never turn an accepted write into a device retry.
      }
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Request-ID": requestId,
          ...(status === 405 ? { Allow: "POST" } : {}),
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      });
    };

    if (request.method !== "POST")
      return respond(405, { error: "method_not_allowed" });
    const token = request.headers.get("X-Device-Token");
    if (!token || !/^(?!sb_|sbp_)[A-Za-z0-9_-]{32,256}$/.test(token))
      return respond(401, { error: "unauthorized" });
    const mediaType = request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json")
      return respond(415, { error: "json_required" });
    if (Number(request.headers.get("Content-Length")) > limit)
      return respond(413, { error: "payload_too_large" });

    let payload: TelemetryPayload;
    try {
      const body = await withDeadline(bodyTimeout, request.signal, (signal) =>
        readBody(request, limit, signal),
      );
      payload = validateTelemetry(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
        deps.now?.() ?? new Date(),
        config,
      );
    } catch (error) {
      if (error instanceof DeadlineError)
        return respond(408, { error: "request_timeout" });
      if (error instanceof BodySizeError)
        return respond(413, { error: "payload_too_large" });
      return respond(400, { error: "invalid_payload" });
    }

    try {
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(token),
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const result = safeStoreResult(
        await withDeadline(storeTimeout, request.signal, (signal) =>
          deps.store(payload, hash, signal),
        ),
      );
      const { status, ...body } = result;
      return respond(status, body);
    } catch (error) {
      return respond(
        503,
        { error: "temporarily_unavailable" },
        error instanceof DeadlineError
          ? "storage_timeout"
          : "storage_unavailable",
      );
    }
  };
}
