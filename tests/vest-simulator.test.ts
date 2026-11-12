import { afterEach, describe, expect, it, vi } from "vitest";
import { validateTelemetry } from "../src/domain/telemetry";
import {
  createSimulation,
  updateSimulation,
  startSimulationClock,
  SIMULATION_INTERVAL_MS,
  MAX_SIMULATED_READINGS,
  MAX_SIMULATED_EVENTS,
} from "../src/features/simulator/engine";

const now = new Date("2026-10-29T12:00:00Z");
afterEach(() => vi.useRealTimers());

describe("explicit local SGE-001 simulation", () => {
  it("generates only marked synthetic payloads compatible with the vest contract", () => {
    const state = createSimulation(now, () => 0.5);
    expect(state.running).toBe(false);
    expect(state.readings[0].source).toBe("simulated");
    expect(state.readings[0].payload.device_code).toBe("SGE-001");
    expect(() =>
      validateTelemetry(state.readings[0].payload, now),
    ).not.toThrow();
    expect(state.readings[0].payload.metrics.battery_percent).toBe(85);
    expect(state.readings[0].payload.metrics.temperature_c).toBe(36.5);
  });
  it("uses a three-second clock and cancels it on cleanup", () => {
    vi.useFakeTimers();
    expect(SIMULATION_INTERVAL_MS).toBe(3000);
    const tick = vi.fn(),
      stop = startSimulationClock(tick);
    vi.advanceTimersByTime(2999);
    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(9000);
    expect(tick).toHaveBeenCalledTimes(3);
  });
  it("does not generate readings while paused or disconnected", () => {
    const paused = createSimulation(now);
    expect(updateSimulation(paused, { type: "tick" }, now)).toBe(paused);
    const running = updateSimulation(
      paused,
      { type: "running", value: true },
      now,
    );
    const next = updateSimulation(
      running,
      { type: "tick" },
      new Date(+now + 3000),
    );
    expect(next.total).toBe(2);
    const offline = updateSimulation(
      next,
      { type: "connected", value: false },
      now,
    );
    expect(updateSimulation(offline, { type: "tick" }, now)).toBe(offline);
    expect(updateSimulation(offline, { type: "sample" }, now)).toBe(offline);
    expect(offline.events[0].type).toBe("disconnected");
    const online = updateSimulation(
      offline,
      { type: "connected", value: true },
      new Date(+now + 6000),
    );
    expect(online.total).toBe(3);
    expect(online.events[0].type).toBe("reconnected");
  });
  it("makes manual readings distinct without starting automatic generation", () => {
    const first = createSimulation(now, () => 0);
    const second = updateSimulation(first, { type: "sample" }, now, () => 0.99);
    expect(second.running).toBe(false);
    expect(second.readings[0].payload.message_id).not.toBe(
      first.readings[0].payload.message_id,
    );
    expect(second.readings[0].payload.metrics.heart_rate_bpm).not.toBe(
      first.readings[0].payload.metrics.heart_rate_bpm,
    );
  });
  it("preserves missing readings as null, not zero", () => {
    let state = updateSimulation(
      createSimulation(now),
      { type: "partial", value: true },
      now,
    );
    state = updateSimulation(state, { type: "sample" }, now);
    expect(state.readings[0].payload.metrics).toMatchObject({
      heart_rate_bpm: null,
      spo2_percent: null,
      temperature_c: null,
    });
    expect(state.readings[0].payload.metrics.battery_percent).not.toBeNull();
  });
  it.each(["event", "fall", "low-battery"] as const)(
    "records an explicitly simulated %s scenario",
    (type) => {
      const state = updateSimulation(createSimulation(now), { type }, now);
      expect(state.events[0].source).toBe("simulated");
      expect(state.total).toBe(2);
      if (type === "fall")
        expect(state.readings[0].payload.event).toBe("fall_detected");
      if (type === "event")
        expect(state.readings[0].payload.event).toBe("device_test");
      if (type === "low-battery")
        expect(state.readings[0].payload.metrics.battery_percent).toBe(5);
      expect(() =>
        validateTelemetry(state.readings[0].payload, now),
      ).not.toThrow();
    },
  );
  it("bounds readings and events and resets all synthetic state", () => {
    let state = createSimulation(now);
    for (let n = 0; n < 100; n++)
      state = updateSimulation(
        state,
        { type: "event" },
        new Date(+now + n * 3000),
      );
    expect(state.readings).toHaveLength(MAX_SIMULATED_READINGS);
    expect(state.events).toHaveLength(MAX_SIMULATED_EVENTS);
    expect(state.total).toBe(101);
    const reset = updateSimulation(state, { type: "reset" }, now);
    expect(reset.total).toBe(1);
    expect(reset.events).toHaveLength(0);
    expect(reset.running).toBe(false);
  });
});
