import { expect, it } from "vitest";
import { metricStatus } from "../src/domain/metricStatus";
import type { CareSettings } from "../src/features/people/careSettings";
const care = {
  birth_date: "1940-01-01",
  weight_kg: 70,
  height_cm: 170,
  medications: "Nenhum informado",
  professional_reference: "Orientação fictícia de teste",
  heart_rate_bpm: { min: 60, max: 100 },
  spo2_percent: { min: 95, max: 100 },
  temperature_c: null,
} satisfies CareSettings;
it("does not call absent, stale or impossible oxygen readings normal", () => {
  expect(metricStatus("spo2_percent", null, true).tone).toBe("muted");
  expect(metricStatus("spo2_percent", 98, false).tone).toBe("muted");
  expect(metricStatus("spo2_percent", 101, true, care).label).toBe(
    "Verificar sensor",
  );
  expect(metricStatus("spo2_percent", 92, true, care).label).toBe(
    "Abaixo da referência",
  );
  expect(metricStatus("spo2_percent", 98, true, care).tone).toBe("normal");
  expect(metricStatus("spo2_percent", 98, true).label).toBe(
    "Sem faixa individual",
  );
  expect(metricStatus("heart_rate_bpm", 120, true, care).label).toBe(
    "Acima da referência",
  );
  expect(metricStatus("battery_percent", 15, true).label).toBe("Bateria fraca");
});
