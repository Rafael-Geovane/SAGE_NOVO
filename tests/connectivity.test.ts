import { it, expect } from "vitest";
import { connectionState } from "../src/domain/connectivity";
it("distinguishes missing, fresh and stale", () => {
  const n = new Date("2026-10-16T12:00:16Z");
  expect(connectionState(null, n, 15)).toBe("no-data");
  expect(connectionState("2026-10-16T12:00:02Z", n, 15)).toBe("online");
  expect(connectionState("2026-10-16T12:00:00Z", n, 15)).toBe("stale");
});
it("distinguishes stale reception from offline and disabled devices", () => {
  const now = new Date("2026-10-19T12:02:00Z");
  expect(connectionState("2026-10-19T12:01:30Z", now, 15, 90)).toBe("stale");
  expect(connectionState("2026-10-19T12:00:00Z", now, 15, 90)).toBe("offline");
  expect(connectionState("2026-10-19T12:01:59Z", now, 15, 90, false)).toBe(
    "offline",
  );
  expect(connectionState("2026-10-19T12:05:00Z", now, 15, 90)).toBe("no-data");
});
