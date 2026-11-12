import { describe, it, expect } from "vitest";
import { validateTelemetry } from "../src/domain/telemetry";
const now = new Date("2026-10-16T12:00:00Z");
export const payload = {
  schema_version: 1,
  message_id: "b7c77d14-7f70-4de5-a355-bc62733d2077",
  device_code: "SGE-001",
  recorded_at: now.toISOString(),
  metrics: { heart_rate_bpm: null },
  event: null,
};
describe("payload contract", () => {
  it("preserves null without inventing metrics", () =>
    expect(validateTelemetry(payload, now).metrics).toEqual({
      heart_rate_bpm: null,
    }));
  it("accepts absent optional metrics", () =>
    expect(validateTelemetry({ ...payload, metrics: {} }, now).metrics).toEqual(
      {},
    ));
  it.each([
    { schema_version: 2 },
    { device_code: "ABC-001" },
    { message_id: "invalid" },
    { recorded_at: "not a date" },
    { recorded_at: "2026-10-16T12:00:00" },
    { recorded_at: "2026-10-16T12:02:00Z" },
    { recorded_at: "2026-09-01T00:00:00Z" },
    { metrics: { heart_rate_bpm: "70" } },
    { metrics: { spo2_percent: 101 } },
    { metrics: { unknown: 3 } },
    { event: "diagnosis" },
  ])("rejects invalid payload %j", (part) =>
    expect(() => validateTelemetry({ ...payload, ...part }, now)).toThrow(),
  );
  it("allows old backfill inside window", () =>
    expect(
      validateTelemetry(
        { ...payload, recorded_at: "2026-10-15T12:00:00Z" },
        now,
      ).device_code,
    ).toBe("SGE-001"));

  it("accepts an explicitly unavailable or rad/s gyroscope", () => {
    expect(
      validateTelemetry({ ...payload, metrics: { gyroscope: null } }, now)
        .metrics,
    ).toEqual({ gyroscope: null });
    const gyroscope = { x: 0.1, y: -0.2, z: 0, unit: "rad/s" };
    expect(
      validateTelemetry({ ...payload, metrics: { gyroscope } }, now).metrics,
    ).toEqual({ gyroscope });
  });

  it.each([
    { maxFutureSeconds: NaN, maxAgeDays: 7 },
    { maxFutureSeconds: Infinity, maxAgeDays: 7 },
    { maxFutureSeconds: -1, maxAgeDays: 7 },
    { maxFutureSeconds: 3601, maxAgeDays: 7 },
    { maxFutureSeconds: 60, maxAgeDays: NaN },
    { maxFutureSeconds: 60, maxAgeDays: 31 },
  ])("fails closed with invalid timestamp configuration %j", (config) => {
    expect(() => validateTelemetry(payload, now, config)).toThrow();
  });

  it("fails closed with an invalid server clock", () => {
    expect(() => validateTelemetry(payload, new Date(NaN))).toThrow();
  });

  it.each([
    { unexpected: true },
    { metrics: { accelerometer: { x: 1, y: 2, z: 3, unit: "g" } } },
    { metrics: { accelerometer: { x: 1, y: 2, z: 3, unit: "m/s2", raw: 1 } } },
    { metrics: { gyroscope: { x: 1, y: 2, z: 3, unit: "deg/s" } } },
    { metrics: { gyroscope: { x: 1, y: Infinity, z: 3, unit: "rad/s" } } },
    { metrics: { heart_rate_bpm: -1 } },
    { metrics: { temperature_c: NaN } },
    { metrics: { battery_percent: -1 } },
  ])("rejects invalid nested or unknown data %j", (part) => {
    expect(() => validateTelemetry({ ...payload, ...part }, now)).toThrow();
  });

  it.each([
    ["2026-10-16T12:01:00.000Z", true],
    ["2026-10-16T12:01:00.001Z", false],
    ["2026-10-09T12:00:00.000Z", true],
    ["2026-10-09T11:59:59.999Z", false],
    ["2026-10-16T09:00:00-03:00", true],
  ])("enforces timestamp boundary for %s", (recorded_at, accepted) => {
    const validate = () => validateTelemetry({ ...payload, recorded_at }, now);
    if (accepted) expect(validate).not.toThrow();
    else expect(validate).toThrow();
  });
});
