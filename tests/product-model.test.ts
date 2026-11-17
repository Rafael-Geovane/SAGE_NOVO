import { expect, it } from "vitest";
import { Box3, Mesh } from "three";
import { buildProduct } from "../src/features/product-model/geometry";
import { productComponents } from "../src/features/product-model/components";
it("builds all confirmed prototype components as real finite 3D geometry", () => {
  const model = buildProduct();
  expect([...model.parts.keys()].sort()).toEqual(
    productComponents.map((p) => p.id).sort(),
  );
  let meshes = 0;
  model.root.traverse((object) => {
    if (object instanceof Mesh) {
      meshes++;
      const positions = object.geometry.getAttribute("position");
      expect([...positions.array].every(Number.isFinite)).toBe(true);
    }
  });
  expect(meshes).toBeGreaterThan(50);
  expect(new Box3().setFromObject(model.root).isEmpty()).toBe(false);
});
it("separates electronics and wires in the exploded view instead of using a flat image", () => {
  const model = buildProduct();
  expect(model.parts.get("esp32")!.visible).toBe(false);
  expect(model.parts.get("wires")!.visible).toBe(false);
  const original = model.parts.get("case")!.position.clone();
  model.setView("exploded");
  expect(model.parts.get("esp32")!.visible).toBe(true);
  expect(model.parts.get("wires")!.visible).toBe(true);
  expect(model.parts.get("case")!.position.equals(original)).toBe(false);
  expect(
    model.parts
      .get("max30102")!
      .position.equals(model.parts.get("max30205")!.position),
  ).toBe(false);
  model.setView("external");
  expect(model.parts.get("case")!.position.equals(original)).toBe(true);
});
