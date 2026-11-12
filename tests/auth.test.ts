import { describe, it, expect } from "vitest";
import { safeReturnTo } from "../src/features/auth/redirect";
describe("internal redirects", () => {
  it.each(["https://evil.test", "//evil.test", "/unknown", "/\\evil.test"])(
    "blocks %s",
    (value) => expect(safeReturnTo(value)).toBe("/dashboard"),
  );
  it("preserves supported paths only", () =>
    expect(safeReturnTo("/admin")).toBe("/admin"));
});
