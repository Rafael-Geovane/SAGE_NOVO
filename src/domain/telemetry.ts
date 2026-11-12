import { z } from "zod";
export type IngestConfig = { maxFutureSeconds: number; maxAgeDays: number };
export const DEFAULT_INGEST_CONFIG: IngestConfig = {
  maxFutureSeconds: 60,
  maxAgeDays: 7,
};
const configSchema = z.strictObject({
  maxFutureSeconds: z.number().finite().min(0).max(3600),
  maxAgeDays: z.number().finite().min(0).max(30),
});
export function validateIngestConfig(config: IngestConfig): IngestConfig {
  return configSchema.parse(config);
}
const finite = z.number().finite();
const schema = z.strictObject({
  schema_version: z.literal(1),
  message_id: z.uuid(),
  device_code: z.string().regex(/^SGE-\d{3}$/),
  recorded_at: z.iso.datetime({ offset: true }),
  metrics: z.strictObject({
    heart_rate_bpm: finite.nonnegative().nullable().optional(),
    spo2_percent: finite.min(0).max(100).nullable().optional(),
    temperature_c: finite.nullable().optional(),
    battery_percent: finite.min(0).max(100).nullable().optional(),
    accelerometer: z
      .strictObject({
        x: finite,
        y: finite,
        z: finite,
        unit: z.literal("m/s2"),
      })
      .nullable()
      .optional(),
    // Reserved contract field; this does not assert that firmware has this sensor.
    gyroscope: z
      .strictObject({
        x: finite,
        y: finite,
        z: finite,
        unit: z.literal("rad/s"),
      })
      .nullable()
      .optional(),
  }),
  event: z.enum(["fall_detected", "device_test"]).nullable().optional(),
});
export type TelemetryPayload = z.infer<typeof schema>;
export function validateTelemetry(
  input: unknown,
  now = new Date(),
  config: IngestConfig = DEFAULT_INGEST_CONFIG,
): TelemetryPayload {
  const window = validateIngestConfig(config);
  if (!Number.isFinite(now.getTime())) throw new Error("invalid_server_clock");
  const value = schema.parse(input);
  const age = now.getTime() - new Date(value.recorded_at).getTime();
  if (
    !Number.isFinite(age) ||
    age < -window.maxFutureSeconds * 1000 ||
    age > window.maxAgeDays * 86400000
  )
    throw new Error("timestamp_outside_window");
  return value;
}
