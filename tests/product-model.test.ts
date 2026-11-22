import { expect, it } from "vitest";
import { Box3, Mesh, type BufferGeometry, type Material } from "three";
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

it("seats the electronics inside the case and the three sensors separately inside the vest", () => {
  const model = buildProduct();
  model.setView("assembly");
  model.assembly.pose(1);
  const bounds = (id: Parameters<typeof model.parts.get>[0]) =>
    new Box3().setFromObject(model.parts.get(id)!);
  const enclosure = bounds("case");
  const vest = bounds("vest");
  for (const id of ["esp32", "battery", "charger"] as const) {
    expect(enclosure.containsBox(bounds(id))).toBe(true);
  }
  expect(bounds("battery").intersectsBox(bounds("esp32"))).toBe(false);
  // Even the mounting face must lie behind the back fabric (z ≈ -0.44).
  expect(enclosure.max.z).toBeLessThan(-0.45);
  expect(vest.containsBox(enclosure)).toBe(false);
  for (const id of ["max30102", "max30205", "bmi160"] as const) {
    expect(vest.containsBox(bounds(id))).toBe(true);
    expect(enclosure.intersectsBox(bounds(id))).toBe(false);
    expect(model.parts.get(id)!.visible).toBe(true);
  }
  model.assembly.pose(0);
  expect(vest.containsBox(bounds("max30102"))).toBe(false);
});

it("restores the vest materials at the end of the reveal and resets transparency on replay", () => {
  const model = buildProduct();
  const vest = model.parts.get("vest")!;
  const cloth = vest.getObjectByProperty("type", "Mesh") as Mesh<
    BufferGeometry,
    Material
  >;
  const original = cloth.material;
  model.setView("assembly");
  const cutaway = cloth.material;
  expect(cutaway).not.toBe(original);
  model.assembly.pose(1);
  model.assembly.setExterior(0.5);
  expect(cloth.material.opacity).toBeGreaterThan(0.13);
  expect(cloth.material.opacity).toBeLessThan(1);
  model.assembly.setExterior(1);
  expect(cloth.material).toBe(original);
  model.assembly.setExterior(0);
  expect(cloth.material).toBe(cutaway);
  expect(cloth.material.opacity).toBeCloseTo(0.13);
});
