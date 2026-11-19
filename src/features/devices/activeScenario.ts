import { scenarios, type Scenario } from "./scenarios";
export function simulationPaused(id: string, assignment: string) {
  try {
    return localStorage.getItem(`sage-paused:${id}:${assignment}`) === "true";
  } catch {
    return false;
  }
}
export function pauseSimulation(
  id: string,
  assignment: string,
  paused: boolean,
) {
  localStorage.setItem(`sage-paused:${id}:${assignment}`, String(paused));
  window.dispatchEvent(new Event("sage-simulation"));
}
const key = (id: string, assignment: string) =>
  `sage-scenario:${id}:${assignment}`;
export function activeScenario(id: string, assignment: string): Scenario {
  try {
    const value = localStorage.getItem(key(id, assignment));
    return scenarios.some(
      (s) => s.id === value && !["fall", "device-test"].includes(s.id),
    )
      ? (value as Scenario)
      : "normal";
  } catch {
    return "normal";
  }
}
export function saveScenario(
  id: string,
  assignment: string,
  scenario: Scenario,
) {
  localStorage.setItem(key(id, assignment), scenario);
}
