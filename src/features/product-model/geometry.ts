import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ComponentId, ProductView } from "./components";

export function buildProduct() {
  const root = new THREE.Group();
  const parts = new Map<ComponentId, THREE.Group>();
  const standard = (
    color: THREE.ColorRepresentation,
    metalness = 0,
    roughness = 0.65,
  ) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const cloth = standard("#24405f", 0, 0.98);
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const hole = Math.hypot((x % 8) - 4, (y % 8) - 4) < 2;
      const v = hole ? 90 : 195 + ((x * 13 + y * 7) % 45);
      pixels.set([v, v, v, 255], (y * 32 + x) * 4);
    }
  const weave = new THREE.DataTexture(pixels, 32, 32);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(12, 15);
  weave.needsUpdate = true;
  cloth.bumpMap = weave;
  cloth.map = weave;
  cloth.bumpScale = 0.012;
  const fabricTrim = standard("#243d59");
  const dark = standard("#26303b", 0.12, 0.48);
  const metal = standard("#bbc5cf", 0.75, 0.32);
  const gold = standard("#c5a44c", 0.65, 0.4);
  const pcb = standard("#146d62", 0.1, 0.63);
  const chip = standard("#151e29", 0.15);
  const body = (id: ComponentId) => {
    const group = new THREE.Group();
    group.userData.componentId = id;
    parts.set(id, group);
    root.add(group);
    return group;
  };
  const box = (
    group: THREE.Group,
    size: number[],
    position: number[],
    material: THREE.MeshStandardMaterial,
    radius = 0.02,
  ) => {
    const geometry = new RoundedBoxGeometry(
      size[0],
      size[1],
      size[2],
      2,
      radius,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);
    return mesh;
  };
  const wire = (
    group: THREE.Group,
    points: number[][],
    color: string,
    width = 0.009,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    );
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 30, width, 5, false),
        standard(color),
      ),
    );
  };
  const vest = body("vest");
  // Display coordinates only: these are not physical dimensions.
  const front = new THREE.Shape();
  front.moveTo(0.045, -1.38);
  front.lineTo(0.96, -1.3);
  front.bezierCurveTo(0.9, -0.65, 0.92, -0.15, 0.98, 0.28);
  front.bezierCurveTo(0.75, 0.5, 0.74, 0.95, 0.77, 1.34);
  front.lineTo(0.43, 1.43);
  front.bezierCurveTo(0.36, 1.04, 0.15, 0.67, 0.045, 0.28);
  front.closePath();
  const frontGeometry = new THREE.ExtrudeGeometry(front, {
    depth: 0.055,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 24,
  });
  const position = frontGeometry.getAttribute("position");
  for (let i = 0; i < position.count; i++)
    position.setZ(
      i,
      position.getZ(i) + 0.22 + 0.23 * (1 - position.getX(i) ** 2),
    );
  frontGeometry.computeVertexNormals();
  vest.add(new THREE.Mesh(frontGeometry, cloth));
  const left = new THREE.Mesh(frontGeometry, cloth);
  left.scale.x = -1;
  vest.add(left);
  const back = new THREE.Shape();
  back.moveTo(-0.95, -1.3);
  back.lineTo(0.95, -1.3);
  back.quadraticCurveTo(0.85, -0.2, 0.96, 0.28);
  back.quadraticCurveTo(0.7, 0.65, 0.77, 1.34);
  back.lineTo(0.43, 1.43);
  back.quadraticCurveTo(0, 1.08, -0.43, 1.43);
  back.lineTo(-0.77, 1.34);
  back.quadraticCurveTo(-0.7, 0.65, -0.96, 0.28);
  back.quadraticCurveTo(-0.85, -0.2, -0.95, -1.3);
  const backMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(back, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      curveSegments: 24,
    }),
    cloth,
  );
  backMesh.position.z = -0.4;
  vest.add(backMesh);
  for (const side of [-1, 1]) {
    box(vest, [0.29, 0.13, 0.74], [side * 0.6, 1.33, 0.03], cloth, 0.04);
    box(vest, [0.09, 1.55, 0.6], [side * 0.92, -0.52, -0.04], cloth, 0.035);
    wire(
      vest,
      [
        [side * 0.055, -1.35, 0.48],
        [side * 0.055, 0.26, 0.5],
        [side * 0.24, 0.76, 0.47],
        [side * 0.44, 1.4, 0.4],
      ],
      "#3d536f",
      0.015,
    );
    wire(
      vest,
      [
        [side * 0.08, -1.36, 0.49],
        [side * 0.5, -1.32, 0.45],
        [side * 0.94, -1.28, 0.28],
      ],
      "#40516a",
      0.009,
    );
  }
  box(vest, [0.035, 1.66, 0.045], [0, -0.55, 0.49], dark, 0.008);
  for (let i = 0; i < 34; i++)
    box(
      vest,
      [0.055, 0.011, 0.015],
      [0, -1.34 + i * 0.048, 0.525],
      metal,
      0.002,
    );
  box(vest, [0.075, 0.15, 0.04], [0, 0.23, 0.55], dark, 0.012);
  if (typeof document !== "undefined") {
    const label = document.createElement("canvas");
    label.width = 256;
    label.height = 80;
    const ctx = label.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#d3e7f4";
      ctx.font = "600 44px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SAGE", 128, 54);
      const texture = new THREE.CanvasTexture(label);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.106),
        new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          roughness: 1,
        }),
      );
      mesh.position.set(-0.43, 0.25, 0.49);
      vest.add(mesh);
    }
  }
  box(vest, [0.47, 0.57, 0.055], [0.57, -0.91, 0.48], fabricTrim, 0.04);
  wire(
    vest,
    [
      [0.37, -0.65, 0.53],
      [0.57, -0.68, 0.55],
      [0.78, -0.65, 0.49],
    ],
    "#5a6d83",
    0.008,
  );
  const enclosure = body("case");
  const shell = new THREE.Shape();
  const w = 0.24,
    h = 0.34,
    r = 0.075;
  shell.moveTo(-w + r, -h);
  shell.lineTo(w - r, -h);
  shell.quadraticCurveTo(w, -h, w, -h + r);
  shell.lineTo(w, h - r);
  shell.quadraticCurveTo(w, h, w - r, h);
  shell.lineTo(-w + r, h);
  shell.quadraticCurveTo(-w, h, -w, h - r);
  shell.lineTo(-w, -h + r);
  shell.quadraticCurveTo(-w, -h, -w + r, -h);
  const cutout = new THREE.Path();
  cutout.absellipse(0, 0, 0.185, 0.275, 0, Math.PI * 2, true);
  shell.holes.push(cutout);
  enclosure.add(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(shell, {
        depth: 0.095,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        bevelSegments: 2,
        curveSegments: 24,
      }),
      dark,
    ),
  );
  box(enclosure, [0.43, 0.63, 0.035], [0, 0, -0.025], dark, 0.06);
  const cover = new THREE.Group();
  cover.userData.componentId = "case";
  root.add(cover);
  box(cover, [0.47, 0.67, 0.08], [0, 0, 0], dark, 0.065);
  // Rear cradle, stitched reinforcement and retaining straps (visual concept).
  box(vest, [0.68, 0.9, 0.055], [0, 0.35, -0.44], fabricTrim, 0.06);
  for (const x of [-0.3, 0.3]) {
    for (let i = 0; i < 28; i++)
      box(
        vest,
        [0.012, 0.015, 0.008],
        [x, -0.05 + i * 0.03, -0.475],
        metal,
        0.002,
      );
    box(vest, [0.075, 0.76, 0.04], [x, 0.35, -0.49], dark, 0.012);
  }
  for (const y of [-0.07, 0.77])
    wire(
      vest,
      [
        [-0.3, y, -0.48],
        [0, y, -0.48],
        [0.3, y, -0.48],
      ],
      "#60768c",
      0.006,
    );
  // Mating rim, internal ribs, screw bosses and cross-head fasteners.
  for (const x of [-0.175, 0.175]) {
    for (const y of [-0.265, 0.265]) {
      const boss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.028, 0.08, 16),
        dark,
      );
      boss.rotation.x = Math.PI / 2;
      boss.position.set(x, y, 0.025);
      enclosure.add(boss);
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.009, 16),
        metal,
      );
      head.rotation.x = Math.PI / 2;
      head.position.set(x, y, 0.045);
      cover.add(head);
      box(cover, [0.025, 0.004, 0.003], [x, y, 0.051], chip, 0.001);
      box(cover, [0.004, 0.025, 0.003], [x, y, 0.051], chip, 0.001);
    }
    for (let i = 0; i < 5; i++)
      box(
        enclosure,
        [0.035, 0.014, 0.045],
        [x, -0.17 + i * 0.085, 0.015],
        dark,
        0.003,
      );
  }
  box(cover, [0.35, 0.49, 0.012], [0, 0, -0.045], fabricTrim, 0.045);
  box(cover, [0.3, 0.12, 0.008], [0, 0.08, 0.044], fabricTrim, 0.012);
  // Embossed circuit motif; no unconfirmed display or indicator hardware.
  wire(
    cover,
    [
      [-0.11, 0.08, 0.052],
      [-0.055, 0.08, 0.052],
      [-0.025, 0.12, 0.052],
      [0.015, 0.025, 0.052],
      [0.05, 0.08, 0.052],
      [0.11, 0.08, 0.052],
    ],
    "#8ba6b8",
    0.004,
  );
  for (let i = 0; i < 5; i++)
    box(
      cover,
      [0.25, 0.007, 0.004],
      [0, -0.08 - i * 0.022, 0.043],
      fabricTrim,
      0.002,
    );
  box(enclosure, [0.09, 0.045, 0.04], [0, 0.34, 0.025], chip, 0.01);
  wire(
    vest,
    [
      [0, 0.73, -0.5],
      [0.16, 0.89, -0.46],
      [0.4, 1.07, -0.44],
      [0.56, 1.31, -0.3],
    ],
    "#29313c",
    0.014,
  );
  const controller = body("esp32");
  box(controller, [0.24, 0.46, 0.025], [0, 0, 0], chip);
  box(controller, [0.19, 0.2, 0.035], [0, 0.055, 0.028], metal);
  box(controller, [0.12, 0.07, 0.025], [0, 0.17, 0.025], chip);
  box(controller, [0.085, 0.055, 0.045], [0, -0.225, 0.02], metal, 0.007);
  for (const x of [-0.12, 0.12])
    for (let i = 0; i < 12; i++)
      box(
        controller,
        [0.025, 0.018, 0.025],
        [x, -0.18 + i * 0.033, 0.018],
        gold,
        0.003,
      );
  for (let i = 0; i < 4; i++)
    box(
      controller,
      [0.045, 0.025, 0.02],
      [(i % 2) * 0.08 - 0.04, -0.13 + Math.floor(i / 2) * 0.047, 0.025],
      chip,
      0.004,
    );
  const battery = body("battery");
  box(battery, [0.29, 0.32, 0.045], [0, 0, 0], metal);
  box(battery, [0.3, 0.035, 0.05], [0, 0.15, 0], gold, 0.005);
  const board = (id: ComponentId, width = 0.15, height = 0.15) => {
    const group = body(id);
    box(group, [width, height, 0.018], [0, 0, 0], pcb, 0.009);
    box(
      group,
      [width * 0.43, height * 0.36, 0.025],
      [0, 0, 0.021],
      chip,
      0.004,
    );
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.009, 0.003, 5, 10),
          gold,
        );
        ring.position.set(
          x * (width / 2 - 0.018),
          y * (height / 2 - 0.018),
          0.015,
        );
        group.add(ring);
      }
    return group;
  };
  const charger = board("charger", 0.17, 0.18);
  box(charger, [0.065, 0.04, 0.035], [0, -0.08, 0.018], metal, 0.004);
  const ppg = board("max30102", 0.18, 0.15);
  box(ppg, [0.075, 0.06, 0.035], [0, 0, 0.035], dark, 0.008);
  box(
    ppg,
    [0.018, 0.018, 0.008],
    [-0.019, 0, 0.058],
    standard("#b3414c"),
    0.003,
  );
  box(
    ppg,
    [0.018, 0.018, 0.008],
    [0.019, 0, 0.058],
    standard("#7fa496"),
    0.003,
  );
  board("max30205", 0.14, 0.14);
  board("bmi160", 0.17, 0.15);
  const wires = body("wires");
  const targets = {
    esp32: [0.35, 0.55, 0.45],
    battery: [0.35, -0.35, 0.45],
    charger: [1.12, -0.5, 0.5],
    max30102: [1.14, 1.1, 0.5],
    max30205: [1.65, 0.57, 0.5],
    bmi160: [1.65, -0.07, 0.5],
  };
  for (const [index, [, target]] of Object.entries(targets).entries()) {
    const [x, y, z] = target;
    wire(
      wires,
      [
        [0.34, 0.35, 0.43],
        [0.65, 0.3 - index * 0.07, 0.42],
        [x - 0.13, y - 0.05, z],
        [x, y, z],
      ],
      index % 2 ? "#bc575b" : "#405f8d",
      0.007,
    );
  }
  const externalPosition = new THREE.Vector3(0, 0.35, -0.51);
  function setView(view: ProductView) {
    const exploded = view === "exploded";
    enclosure.rotation.y = cover.rotation.y = exploded ? 0 : Math.PI;
    vest.position.set(exploded ? -1.08 : 0, 0, 0);
    enclosure.position.copy(
      exploded ? new THREE.Vector3(0.32, 0.48, 0.05) : externalPosition,
    );
    cover.position.copy(
      exploded
        ? new THREE.Vector3(2.65, 0.45, 0.3)
        : externalPosition.clone().add(new THREE.Vector3(0, 0, -0.16)),
    );
    cover.scale.setScalar(exploded ? 1.7 : 1);
    enclosure.scale.setScalar(exploded ? 1.7 : 1);
    for (const [id, target] of Object.entries(targets)) {
      const g = parts.get(id as ComponentId)!;
      g.visible = exploded;
      g.position.set(...(target as [number, number, number]));
      g.scale.setScalar(exploded ? 1.8 : 1);
    }
    wires.visible = exploded;
  }
  setView("external");
  return { root, parts, setView, texture: weave };
}
