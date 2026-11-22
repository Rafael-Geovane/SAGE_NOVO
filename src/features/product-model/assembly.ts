import * as THREE from "three";
import type { ComponentId } from "./components";

export const explodedParts = {
  esp32: [1.27, 0.54, 0.48],
  battery: [1.08, -0.48, 0.46],
  charger: [1.76, -0.63, 0.5],
  max30102: [2.05, 1.08, 0.55],
  max30205: [2.05, 0.47, 0.55],
  bmi160: [2.05, -0.08, 0.55],
} satisfies Record<string, [number, number, number]>;

const sensors = [
  { id: "max30102", seat: [0.42, 0.51, 0.38], angle: -2.92 },
  { id: "max30205", seat: [-0.42, -0.08, 0.38], angle: 2.92 },
  { id: "bmi160", seat: [0.5, -0.85, -0.29], angle: -0.24 },
] as const;

const electronics = [
  { id: "battery", seat: [0.143, 0.1, 0.045], size: 0.7 },
  { id: "esp32", seat: [-0.138, 0.015, 0.054], size: 0.83 },
  { id: "charger", seat: [0.143, -0.175, 0.03], size: 0.8 },
] as const;

const openCase = new THREE.Vector3(0.48, 0.42, 0.03);
const installedCase = new THREE.Vector3(0, 0.35, -0.52);
export const installedCableExit = installedCase
  .clone()
  .add(new THREE.Vector3(0, 0.4, -0.065));
const openLid = new THREE.Vector3(2.97, 0.27, 0.15);
const step = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;

export function createAssembly(
  parts: Map<ComponentId, THREE.Group>,
  lid: THREE.Group,
  clothColor: THREE.Color,
) {
  const vest = parts.get("vest")!,
    enclosure = parts.get("case")!;
  const fabricGlass = new THREE.MeshStandardMaterial({
    color: "#467190",
    roughness: 0.74,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  const lidGlass = new THREE.MeshStandardMaterial({
    color: "#6baaba",
    roughness: 0.36,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const cutawayColor = fabricGlass.color.clone();
  function materialsOf(group: THREE.Group) {
    const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) original.set(object, object.material);
    });
    return original;
  }
  const fabric = materialsOf(vest),
    cover = materialsOf(lid);
  const harness = new THREE.Group();
  harness.userData.componentId = "wires";
  const cableMaterial = new THREE.MeshStandardMaterial({
    color: "#34556a",
    roughness: 0.72,
  });
  for (const { seat } of sensors) {
    const side = Math.sign(seat[0]);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.84, -0.39),
      new THREE.Vector3(side * 0.48, 0.78, -0.24),
      new THREE.Vector3(side * 0.79, 0.24, -0.15),
      new THREE.Vector3(side * 0.75, seat[1] - 0.12, seat[2] * 0.69),
      new THREE.Vector3().fromArray(seat),
    ]);
    harness.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(path, 38, 0.008, 6, false),
        cableMaterial,
      ),
    );
  }
  vest.add(harness);
  let cutaway = false,
    translucentLid = false;
  function showLidInterior(show: boolean) {
    if (translucentLid === show) return;
    translucentLid = show;
    for (const [mesh, original] of cover) {
      mesh.material = show ? lidGlass : original;
      mesh.visible = !(
        show &&
        original instanceof THREE.MeshBasicMaterial &&
        original.transparent
      );
    }
  }
  function setExterior(amount: number) {
    const show = amount < 1;
    if (show) {
      fabricGlass.opacity = mix(0.13, 1, amount);
      fabricGlass.color.lerpColors(cutawayColor, clothColor, amount);
    }
    if (cutaway === show) return;
    cutaway = show;
    for (const [mesh, original] of fabric) {
      mesh.material = show ? fabricGlass : original;
      // The outer cloth alone is sufficient to outline the translucent garment.
      mesh.visible = !(
        show &&
        original instanceof THREE.Material &&
        (original.side === THREE.BackSide || original.transparent)
      );
    }
    if (!show) showLidInterior(false);
  }
  const from = new THREE.Vector3(),
    to = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    opening = new THREE.Vector3();
  function pose(progress: number) {
    const dock = step(progress, 0.8, 1);
    const close = step(progress, 0.665, 0.79);
    vest.position.x = mix(-1.12, 0, dock);
    // Clear the flank, pass behind the fabric, then seat the closed case on the cradle.
    const behind = step(dock, 0, 0.43);
    const across = step(dock, 0.38, 0.84);
    const seat = step(dock, 0.84, 1);
    enclosure.position.set(
      vest.position.x + mix(openCase.x + 1.12, installedCase.x, across),
      mix(openCase.y, installedCase.y, across),
      mix(mix(openCase.z, -0.89, behind), installedCase.z, seat),
    );
    enclosure.rotation.y = Math.PI * behind;
    enclosure.scale.setScalar(mix(1.7, 1, step(dock, 0, 0.34)));

    sensors.forEach(({ id, seat, angle }, i) => {
      const part = parts.get(id)!;
      const t = step(progress, 0.018 + i * 0.052, 0.23 + i * 0.052);
      from.fromArray(explodedParts[id]);
      to.fromArray(seat).add(vest.position);
      // Enter at the arm opening, then settle against the lining.
      opening.set(vest.position.x + 0.92, 0.79, 0.045);
      if (t < 0.55) part.position.lerpVectors(from, opening, step(t, 0, 0.55));
      else part.position.lerpVectors(opening, to, step(t, 0.55, 1));
      part.rotation.y = angle * t;
      part.scale.setScalar(mix(1.8, 1, t));
    });
    electronics.forEach(({ id, seat, size }, i) => {
      const part = parts.get(id)!;
      const t = step(progress, 0.33 + i * 0.075, 0.49 + i * 0.075);
      from.fromArray(explodedParts[id]);
      to.fromArray(seat)
        .multiplyScalar(enclosure.scale.x)
        .applyAxisAngle(up, enclosure.rotation.y)
        .add(enclosure.position);
      // Move over the open compartment before lowering the board past the rim.
      part.position.lerpVectors(from, to, step(t, 0, 0.7));
      part.position.z = mix(from.z, to.z, step(t, 0.7, 1));
      part.scale.setScalar(mix(1.8, size * enclosure.scale.x, t));
      part.rotation.y = enclosure.rotation.y;
    });
    to.set(0, 0, 0.187 * enclosure.scale.x)
      .applyAxisAngle(up, enclosure.rotation.y)
      .add(enclosure.position);
    lid.rotation.y = enclosure.rotation.y;
    lid.position.lerpVectors(openLid, to, close);
    lid.position.z += 0.52 * Math.sin(Math.PI * close);
    lid.scale.copy(enclosure.scale);
    showLidInterior(cutaway && progress >= 0.755);
    harness.visible = cutaway && progress > 0.97;
  }
  function dispose() {
    setExterior(1);
    fabricGlass.dispose();
    lidGlass.dispose();
  }
  return { pose, setExterior, dispose };
}
