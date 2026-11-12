import { describe, it, expect, vi } from "vitest";
vi.mock("../src/lib/supabase", () => ({ db: () => ({}) }));
import {
  uniqueNotifications,
  type FallNotification,
} from "../src/features/notifications/api";
const row = (id: string, time: string): FallNotification => ({
  id,
  created_at: time,
  device_id: "device",
  assignment_id: "assignment",
  kind: "fall_detected",
  status: "new",
  fall_outcome: null,
  devices: { code: "SGE-001" },
});
describe("site notification identity", () => {
  it("deduplicates replayed event IDs without suppressing separate falls", () => {
    const a = row("a", "2026-10-30T10:00:00Z"),
      b = row("b", "2026-10-30T10:00:01Z");
    expect(uniqueNotifications([a, b, a])).toEqual([b, a]);
  });
  it("replaces a stale replay with the current state and preserves ID tie order", () => {
    const a = row("a", "2026-10-30T10:00:00Z"),
      b = row("b", a.created_at);
    expect(
      uniqueNotifications([a, b, { ...a, status: "acknowledged" }]),
    ).toEqual([b, { ...a, status: "acknowledged" }]);
  });
});
