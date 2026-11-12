import { expect, it } from "vitest";
import {
  csvCell,
  reportCsv,
  type WeeklyReport,
} from "../src/features/reports/api";
it("escapes spreadsheet formulas, delimiters and quotes", () => {
  expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
  expect(csvCell('a;"b')).toBe('"a;""b"');
});
it("exports only the provided report with source and valid sample counts", () => {
  const report = {
    device_code: "SGE-067",
    start: "2026-11-04",
    end: "2026-11-11",
    metrics: [
      {
        source: "simulated",
        metric: "temperature_c",
        samples: 2,
        mean: 36.5,
        minimum: 36.5,
        maximum: 36.5,
      },
    ],
  } as WeeklyReport;
  expect(reportCsv(report)).toContain("Temperatura (°C)");
  expect(reportCsv(report)).toContain('"simulated"');
  expect(reportCsv(report)).toContain('"2";"36.5"');
});
