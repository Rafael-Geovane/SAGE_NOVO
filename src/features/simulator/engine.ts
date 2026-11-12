import type { TelemetryPayload } from "../../domain/telemetry";

export const SIMULATION_INTERVAL_MS = 3000;
export const MAX_SIMULATED_READINGS = 30;
export const MAX_SIMULATED_EVENTS = 20;
export type SimulatedReading = {
  source: "simulated";
  sequence: number;
  payload: TelemetryPayload;
};
export type SimulatedEvent = {
  id: string;
  source: "simulated";
  type:
    | "device_test"
    | "fall_detected"
    | "battery_test"
    | "disconnected"
    | "reconnected";
  recordedAt: string;
};
export type Simulation = {
  running: boolean;
  connected: boolean;
  partial: boolean;
  total: number;
  readings: SimulatedReading[];
  events: SimulatedEvent[];
};
export type SimulationAction =
  | { type: "tick" | "sample" | "event" | "fall" | "low-battery" | "reset" }
  | { type: "running" | "connected" | "partial"; value: boolean };

function appendReading(
  state: Simulation,
  now: Date,
  random: () => number,
  event: TelemetryPayload["event"] = null,
  battery?: number,
): Simulation {
  // These ranges are synthetic interface fixtures, never clinical thresholds.
  const reading: SimulatedReading = {
    source: "simulated",
    sequence: state.total + 1,
    payload: {
      schema_version: 1,
      device_code: "SGE-001",
      message_id: crypto.randomUUID(),
      recorded_at: now.toISOString(),
      metrics: {
        heart_rate_bpm: state.partial ? null : 70 + Math.round(random() * 6),
        spo2_percent: state.partial ? null : 97 + Math.round(random() * 2),
        temperature_c: state.partial ? null : 36.5,
        battery_percent: battery ?? 85,
        accelerometer: null,
        gyroscope: null,
      },
      event,
    },
  };
  return {
    ...state,
    total: reading.sequence,
    readings: [reading, ...state.readings].slice(0, MAX_SIMULATED_READINGS),
  };
}

function appendEvent(
  state: Simulation,
  type: SimulatedEvent["type"],
  now: Date,
): Simulation {
  const event: SimulatedEvent = {
    id: crypto.randomUUID(),
    source: "simulated",
    type,
    recordedAt: now.toISOString(),
  };
  return {
    ...state,
    events: [event, ...state.events].slice(0, MAX_SIMULATED_EVENTS),
  };
}

export function createSimulation(
  now = new Date(),
  random = Math.random,
): Simulation {
  return appendReading(
    {
      running: false,
      connected: true,
      partial: false,
      total: 0,
      readings: [],
      events: [],
    },
    now,
    random,
  );
}

export function updateSimulation(
  state: Simulation,
  action: SimulationAction,
  now = new Date(),
  random = Math.random,
): Simulation {
  switch (action.type) {
    case "reset":
      return createSimulation(now, random);
    case "running":
      return { ...state, running: action.value };
    case "partial":
      return { ...state, partial: action.value };
    case "connected": {
      if (state.connected === action.value) return state;
      const next = appendEvent(
        { ...state, connected: action.value },
        action.value ? "reconnected" : "disconnected",
        now,
      );
      return action.value ? appendReading(next, now, random) : next;
    }
    case "tick":
      return state.running && state.connected
        ? appendReading(state, now, random)
        : state;
    case "sample":
      return state.connected ? appendReading(state, now, random) : state;
    case "event":
      return state.connected
        ? appendEvent(
            appendReading(state, now, random, "device_test"),
            "device_test",
            now,
          )
        : state;
    case "fall":
      return state.connected
        ? appendEvent(
            appendReading(state, now, random, "fall_detected"),
            "fall_detected",
            now,
          )
        : state;
    case "low-battery":
      return state.connected
        ? appendEvent(
            appendReading(state, now, random, null, 5),
            "battery_test",
            now,
          )
        : state;
  }
}

export function startSimulationClock(tick: () => void) {
  const timer = setInterval(tick, SIMULATION_INTERVAL_MS);
  return () => clearInterval(timer);
}
