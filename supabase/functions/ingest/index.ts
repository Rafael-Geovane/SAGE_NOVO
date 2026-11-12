import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { createIngestHandler } from "./handler.ts";
// Service role is confined to this server entrypoint; never imported by the SPA.
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const numberEnv = (
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = false,
) => {
  const raw = Deno.env.get(key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (
    !raw.trim() ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`invalid_function_configuration: ${key}`);
  return value;
};
const messagesPerMinute = numberEnv(
  "DEVICE_MESSAGES_PER_MINUTE",
  120,
  1,
  600,
  true,
);
Deno.serve(
  createIngestHandler({
    config: {
      maxFutureSeconds: numberEnv("MAX_FUTURE_SECONDS", 60, 0, 3600),
      maxAgeDays: numberEnv("MAX_AGE_DAYS", 7, 0, 30),
    },
    maxBodyBytes: numberEnv("MAX_BODY_BYTES", 16384, 1, 65536, true),
    bodyReadTimeoutMs: numberEnv("BODY_READ_TIMEOUT_MS", 5000, 1, 30000, true),
    storeTimeoutMs: numberEnv("STORE_TIMEOUT_MS", 5000, 1, 30000, true),
    log: (event) => console.info(JSON.stringify(event)),
    store: async (payload, hash, signal) => {
      const { data, error } = await client
        .rpc("ingest_telemetry", {
          p_payload: payload,
          p_token_hash: hash,
          p_limit: messagesPerMinute,
        })
        .abortSignal(signal);
      if (error?.code === "22023")
        return { status: 400, error: "reading_predates_assignment" };
      if (error) throw new Error("storage_unavailable");
      return data;
    },
  }),
);
