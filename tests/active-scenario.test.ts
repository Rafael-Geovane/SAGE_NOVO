import { expect, it, vi } from "vitest";
import {
  activeScenario,
  saveScenario,
} from "../src/features/devices/activeScenario";
it("retains a selected condition across reads, isolates assignments, and restores normal", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  try {
    saveScenario("vest", "assignment", "battery");
    for (let i = 0; i < 4; i++)
      expect(activeScenario("vest", "assignment")).toBe("battery");
    expect(activeScenario("vest", "other-assignment")).toBe("normal");
    saveScenario("vest", "assignment", "normal");
    expect(activeScenario("vest", "assignment")).toBe("normal");
    saveScenario("vest", "assignment", "fall");
    expect(activeScenario("vest", "assignment")).toBe("normal");
  } finally {
    vi.unstubAllGlobals();
  }
});
