import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createAssembly, explodedParts, installedCableExit } from "./assembly";
import { dressVest } from "./garment";
import type { ComponentId, ProductView } from "./components";

export function buildProduct() {
  const root = new THREE.Group();
  const parts = new Map<ComponentId, THREE.Group>();
  const standard = (
    color: THREE.ColorRepresentation,
    metalness = 0,
    roughness = 0.65,
  ) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const cloth = standard("#202f49", 0, 0.98);
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const rowOffset = Math.floor(y / 8) % 2 === 0 ? 0 : 4;
      const hole = Math.hypot(((x + rowOffset) % 8) - 4, (y % 8) - 4) < 2;
      const v = hole ? 112 : 195 + ((x * 13 + y * 7) % 45);
      pixels.set([v, v, v, 255], (y * 32 + x) * 4);
    }
  const weave = new THREE.DataTexture(pixels, 32, 32);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(14, 26);
  weave.generateMipmaps = true;
  weave.minFilter = THREE.LinearMipmapLinearFilter;
  weave.magFilter = THREE.LinearFilter;
  weave.needsUpdate = true;
  cloth.bumpMap = weave;
  cloth.map = weave;
  cloth.bumpScale = 0.002;
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
  const zip = dressVest(vest, cloth, installedCableExit);
  const teeth = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.021, 0.012, 0.01),
    metal,
    96,
  );
  const tooth = new THREE.Matrix4();
  for (let i = 0; i < teeth.count; i++) {
    const p = zip((i + 0.5) / teeth.count);
    tooth.makeTranslation(i % 2 ? 0.005 : -0.005, p.y, p.z + 0.006);
    teeth.setMatrixAt(i, tooth);
  }
  teeth.computeBoundingBox();
  vest.add(teeth);
  const slider = zip(0.976);
  box(
    vest,
    [0.057, 0.075, 0.033],
    [0, slider.y, slider.z + 0.016],
    metal,
    0.012,
  );
  const pull = new THREE.Mesh(
    new THREE.TorusGeometry(0.025, 0.007, 8, 20),
    dark,
  );
  pull.scale.y = 1.9;
  pull.position.set(0, slider.y - 0.045, slider.z + 0.038);
  vest.add(pull);
  const enclosure = body("case");
  function outline(width: number, height: number, radius: number) {
    const path = new THREE.Shape();
    path.moveTo(-width + radius, -height);
    path.lineTo(width - radius, -height);
    path.quadraticCurveTo(width, -height, width, -height + radius);
    path.lineTo(width, height - radius);
    path.quadraticCurveTo(width, height, width - radius, height);
    path.lineTo(-width + radius, height);
    path.quadraticCurveTo(-width, height, -width, height - radius);
    path.lineTo(-width, -height + radius);
    path.quadraticCurveTo(-width, -height, -width + radius, -height);
    return path;
  }
  const shell = outline(0.32, 0.38, 0.075);
  shell.holes.push(outline(0.287, 0.347, 0.055));
  enclosure.add(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(shell, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        bevelSegments: 2,
        curveSegments: 24,
      }),
      dark,
    ),
  );
  box(enclosure, [0.63, 0.75, 0.035], [0, 0, -0.012], dark, 0.06);
  const tray = standard("#475564", 0.24, 0.66);
  const seal = standard("#355e65", 0.1, 0.82);
  function marking(
    group: THREE.Group,
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
  ) {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "600 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#d7e2e7";
    ctx.fillText(text, 128, 48);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const print = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
      }),
    );
    print.position.set(x, y, z);
    group.add(print);
  }
  const gasket = outline(0.308, 0.368, 0.069);
  gasket.holes.push(outline(0.297, 0.357, 0.058));
  const lip = new THREE.Mesh(
    new THREE.ExtrudeGeometry(gasket, {
      depth: 0.006,
      bevelEnabled: false,
      curveSegments: 12,
    }),
    seal,
  );
  lip.position.z = 0.138;
  enclosure.add(lip);
  // Separate the board supports from the cushioned battery well.
  box(enclosure, [0.017, 0.53, 0.057], [0.013, 0, 0.032], tray, 0.005);
  box(enclosure, [0.218, 0.254, 0.019], [0.143, 0.1, 0.016], chip, 0.012);
  for (const x of [-0.218, -0.059]) {
    for (const y of [-0.14, 0.17]) {
      box(enclosure, [0.034, 0.042, 0.031], [x, y, 0.022], tray, 0.006);
    }
  }
  for (const y of [-0.025, 0.226]) {
    box(enclosure, [0.2, 0.012, 0.041], [0.143, y, 0.031], tray, 0.005);
  }
  box(enclosure, [0.168, 0.169, 0.014], [0.143, -0.175, 0.014], tray, 0.012);
  marking(enclosure, "ESP32", -0.138, -0.244, 0.009, 0.23);
  marking(enclosure, "LiPo", 0.143, 0.1, 0.027, 0.18);
  marking(enclosure, "CARGA", 0.143, -0.287, 0.009, 0.18);
  const cover = new THREE.Group();
  cover.userData.componentId = "case";
  root.add(cover);
  const lidShell = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline(0.304, 0.364, 0.065), {
      depth: 0.048,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.016,
      bevelThickness: 0.016,
    }),
    dark,
  );
  lidShell.position.z = -0.024;
  cover.add(lidShell);
  marking(cover, "SAGE", 0, 0.233, 0.042, 0.32);
  // Rear cradle, stitched reinforcement and retaining straps (visual concept).
  const cradle = new THREE.Group();
  vest.add(cradle);
  for (const x of [-0.3, 0.3]) {
    for (let i = 0; i < 28; i++)
      box(
        cradle,
        [0.012, 0.015, 0.008],
        [x, -0.05 + i * 0.03, -0.475],
        metal,
        0.002,
      );
    box(cradle, [0.075, 0.76, 0.04], [x, 0.35, -0.49], dark, 0.012);
  }
  for (const y of [-0.07, 0.77])
    wire(
      cradle,
      [
        [-0.3, y, -0.48],
        [0, y, -0.48],
        [0.3, y, -0.48],
      ],
      "#60768c",
      0.006,
    );
  // Mating rim, internal ribs, screw bosses and cross-head fasteners.
  for (const x of [-0.252, 0.252]) {
    for (const y of [-0.305, 0.305]) {
      const boss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.034, 0.1, 16),
        dark,
      );
      boss.rotation.x = Math.PI / 2;
      boss.position.set(x, y, 0.056);
      enclosure.add(boss);
      const insert = new THREE.Mesh(
        new THREE.TorusGeometry(0.015, 0.005, 8, 20),
        gold,
      );
      insert.position.set(x, y, 0.109);
      enclosure.add(insert);
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
  box(cover, [0.54, 0.64, 0.012], [0, 0, -0.045], fabricTrim, 0.045);
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
  box(enclosure, [0.09, 0.045, 0.04], [0, 0.38, 0.065], chip, 0.01);
  const controller = body("esp32");
  box(controller, [0.24, 0.46, 0.025], [0, 0, 0], chip);
  box(controller, [0.19, 0.2, 0.035], [0, 0.055, 0.028], metal);
  marking(controller, "ESP32", 0, 0.055, 0.047, 0.17);
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
  marking(battery, "LiPo 3,7 V", 0, -0.02, 0.024, 0.255);
  const board = (id: ComponentId, width = 0.15, height = 0.15) => {
    const group = body(id);
    box(group, [width, height, 0.018], [0, 0, 0], pcb, 0.009);
    // Exposed solder lands on the reverse remain visible after insertion in the lining.
    for (const x of [-0.32, 0.32]) {
      for (const y of [-0.17, 0, 0.17])
        box(
          group,
          [0.013, 0.009, 0.004],
          [x * width, y * height, -0.01],
          gold,
          0.002,
        );
    }
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
  for (const [index, [id, target]] of Object.entries(explodedParts).entries()) {
    if (id === "esp32") continue;
    const [x, y, z] = target;
    wire(
      wires,
      [
        [1.23, 0.54, 0.43],
        [1.55, 0.3 - index * 0.07, 0.42],
        [x - 0.13, y - 0.05, z],
        [x, y, z],
      ],
      index % 2 ? "#bc575b" : "#405f8d",
      0.007,
    );
  }
  const assembly = createAssembly(parts, cover, cloth.color);
  function setView(view: ProductView) {
    assembly.setExterior(view === "assembly" ? 0 : 1);
    assembly.pose(view === "external" ? 1 : 0);
    wires.visible = view === "exploded";
    for (const id of Object.keys(explodedParts)) {
      parts.get(id as keyof typeof explodedParts)!.visible =
        view !== "external";
    }
  }
  setView("external");
  return { root, parts, setView, assembly, texture: weave };
}
