import { expect, it } from "vitest";
import { metricStatus } from "../src/domain/metricStatus";
it("does not call absent, stale or impossible oxygen readings normal", () => {
  expect(metricStatus("spo2_percent", null, true).tone).toBe("muted");
  expect(metricStatus("spo2_percent", 98, false).tone).toBe("muted");
  expect(metricStatus("spo2_percent", 101, true).label).toBe(
    "Verificar sensor",
  );
  expect(metricStatus("spo2_percent", 92, true).label).toBe(
    "Abaixo da referência",
  );
  expect(metricStatus("spo2_percent", 98, true).tone).toBe("normal");
  expect(metricStatus("heart_rate_bpm", 120, true).label).toBe(
    "Acima da referência",
  );
  expect(metricStatus("battery_percent", 15, true).label).toBe("Bateria fraca");
});
