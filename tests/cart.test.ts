import { describe, it, expect } from "vitest";
import { readCart } from "../src/features/catalog/cart";
describe("cart integrity", () => {
  it("recovers broken JSON", () => expect(readCart("{bad")).toEqual([]));
  it("ignores unknown variants and invalid quantities", () =>
    expect(
      readCart(
        JSON.stringify([
          { variantId: "unknown", quantity: 1 },
          { variantId: "navy", quantity: 0 },
          { variantId: "navy", quantity: 1.2 },
          { variantId: "navy", quantity: 11 },
        ]),
      ),
    ).toEqual([]));
  it("keeps only safe selection", () =>
    expect(
      readCart(
        JSON.stringify([{ variantId: "navy", quantity: 2, email: "secret" }]),
      ),
    ).toEqual([{ variantId: "navy", quantity: 2 }]));
});
