import * as THREE from "three";

type Surface = (u: number, v: number) => THREE.Vector3;
const { lerp, smoothstep } = THREE.MathUtils;
const halfPi = Math.PI / 2;

// Four cloth panels meet at the flanks and across the tops of the shoulders.
// The free edges between those joins are the neck and arm openings.
const neck = 0.25;
const shoulder = 0.625;
const underarm = 0.12;
function pattern(front: boolean) {
  const face = front ? 1 : -1;
  const point = (x: number, y: number, depth: number) =>
    new THREE.Vector3(x, y, face * depth);
  const inner = point(0.34, 1.48, 0);
  const outer = point(0.83, 1.32, 0);
  const collar = new THREE.CubicBezierCurve3(
    point(0, front ? 0.43 : 1.29, front ? 0.52 : 0.27),
    front ? point(0.1, 0.79, 0.5) : point(0.18, 1.29, 0.27),
    front ? point(0.34, 1.48, 0.21) : point(0.34, 1.48, 0.15),
    inner,
  );
  const arm = new THREE.CubicBezierCurve3(
    outer,
    point(0.83, 1.32, front ? 0.49 : 0.4),
    point(0.99, 0.19, front ? 0.44 : 0.36),
    point(0.99, 0.19, 0),
  );
  function edge(u: number) {
    if (u < neck) return collar.getPoint(u / neck);
    if (u > shoulder) return arm.getPoint((u - shoulder) / (1 - shoulder));
    return inner.clone().lerp(outer, (u - neck) / (shoulder - neck));
  }
  const hem = (u: number) =>
    -1.39 +
    0.115 * Math.sin(u * halfPi) ** 3 -
    (front ? 0 : 0.035 * Math.cos(u * halfPi) ** 2);
  function atHeight(u: number, y: number) {
    const angle = u * halfPi;
    const waist = Math.exp(-(((y + 0.58) / 0.46) ** 2));
    const chest = Math.exp(-(((y - 0.22) / 0.55) ** 2));
    const width = 0.99 - waist * 0.105 + chest * 0.015;
    const depth =
      (front ? 0.47 : 0.43) - waist * 0.045 + chest * (front ? 0.065 : 0.014);
    // Shallow folds fade out at the centre and side seams.
    const folds =
      0.014 *
      Math.sin(22 * u + 1.8 * y) *
      Math.sin(Math.PI * u) ** 2 *
      Math.exp(-(((y + 1.02) / 0.52) ** 2));
    const p = point(
      (width + folds) * Math.sin(angle),
      y,
      (depth + folds) * Math.cos(angle),
    );
    if (y > underarm) {
      const top = edge(u);
      const t = Math.min(1, (y - underarm) / (top.y - underarm));
      p.x = lerp(p.x, top.x, smoothstep(t, 0, 1));
      // Elliptical roll over the shoulder gives the front and back a common tangent.
      p.z = lerp(p.z, top.z, 1 - Math.sqrt(Math.max(0, 1 - t * t)));
    }
    return p;
  }
  const surface: Surface = (u, v) => {
    const top = edge(u);
    if (v === 1) return top;
    const y =
      v < 0.55
        ? lerp(hem(u), underarm, v / 0.55)
        : lerp(underarm, top.y, Math.sin((halfPi * (v - 0.55)) / 0.45));
    return atHeight(u, y);
  };
  return { surface, atHeight, hem, edge };
}

function patch(
  surface: Surface,
  columns: number,
  rows: number,
  reverse = false,
) {
  const positions = [],
    uvs = [],
    indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const u = i / columns,
        v = j / rows;
      const p = surface(u, v);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
      if (i < columns && j < rows) {
        const a = j * (columns + 1) + i,
          b = a + columns + 1;
        indices.push(
          ...(reverse
            ? [a, b, a + 1, a + 1, b, b + 1]
            : [a, a + 1, b, a + 1, b + 1, b]),
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function dressVest(
  vest: THREE.Group,
  cloth: THREE.MeshStandardMaterial,
  cableExit: THREE.Vector3,
) {
  const binding = new THREE.MeshStandardMaterial({
    color: "#19293e",
    roughness: 0.89,
  });
  const seam = new THREE.MeshStandardMaterial({
    color: "#354759",
    roughness: 1,
  });
  const lining = cloth.clone();
  lining.color.set("#101b2a");
  lining.side = THREE.BackSide;
  const front = pattern(true);
  const back = pattern(false);
  // The reinforcement follows the fabric on its inner face and supports the flat case on its outer face.
  const pad = new THREE.BoxGeometry(2, 0.9, 1, 16, 14, 1);
  const padPositions = pad.getAttribute("position");
  for (let i = 0; i < padPositions.count; i++) {
    const x = padPositions.getX(i);
    const y = padPositions.getY(i) + 0.35;
    const p = back.atHeight(Math.abs(x) * 0.235, y);
    padPositions.setXYZ(
      i,
      Math.sign(x) * p.x,
      y,
      lerp(-0.468, p.z - 0.004, padPositions.getZ(i) + 0.5),
    );
  }
  pad.computeVertexNormals();
  for (const isFront of [true, false]) {
    const panel = isFront ? front : back;
    const geometry = patch(panel.surface, 48, 40, !isFront);
    // Measure along the fabric so stitches keep their spacing below the armholes.
    const uv = geometry.getAttribute("uv");
    const positions = geometry.getAttribute("position");
    const previous = new THREE.Vector3(),
      current = new THREE.Vector3();
    for (let i = 0; i <= 48; i++) {
      let length = panel.hem(i / 48) + 1.43;
      previous.fromBufferAttribute(positions, i);
      for (let j = 0; j <= 40; j++) {
        const index = j * 49 + i;
        current.fromBufferAttribute(positions, index);
        length += current.distanceTo(previous);
        uv.setY(index, length / 2.85);
        previous.copy(current);
      }
    }
    for (const side of [-1, 1]) {
      const half = new THREE.Group();
      half.scale.x = side;
      vest.add(half);
      half.add(
        new THREE.Mesh(geometry, cloth),
        new THREE.Mesh(geometry, lining),
      );
      const piping = (
        path: (t: number) => THREE.Vector3,
        radius: number,
        material = binding,
      ) => {
        const points = Array.from({ length: 37 }, (_, i) => path(i / 36));
        const curve = new THREE.CatmullRomCurve3(points);
        half.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(curve, 48, radius, 8, false),
            material,
          ),
        );
      };
      piping((t) => panel.edge(t * neck), 0.023);
      piping((t) => panel.edge(lerp(shoulder, 1, t)), 0.024);
      piping((u) => panel.surface(u, 0), 0.017);
      piping((u) => panel.atHeight(u, panel.hem(u) + 0.045), 0.006, seam);
      piping(
        (v) => panel.surface(0.72 - 0.075 * Math.sin(v * Math.PI), v),
        0.007,
        seam,
      );
    }
  }
  // The pocket is cut on the same curved surface as the right front panel.
  const pocket: Surface = (u, v) => {
    const corner = 0.038 * (1 - smoothstep(v, 0, 0.22)) * (2 * u - 1);
    const across = lerp(0.25, 0.62, u) - corner;
    const y = lerp(-1.18 + 0.045 * (2 * u - 1) ** 2, -0.62 + 0.09 * u, v);
    const p = front.atHeight(across, y);
    const fullness =
      0.012 + 0.065 * Math.sin(Math.PI * u) * smoothstep(v, 0, 0.6);
    p.x += fullness * Math.sin(across * halfPi);
    p.z += fullness * Math.cos(across * halfPi);
    return p;
  };
  const pocketFabric = cloth.clone();
  pocketFabric.color.set("#1b2a3e");
  pocketFabric.side = THREE.DoubleSide;
  const pocketGeometry = patch(pocket, 24, 16);
  const pocketUv = pocketGeometry.getAttribute("uv");
  for (let i = 0; i < pocketUv.count; i++) {
    pocketUv.setXY(i, pocketUv.getX(i) * 0.37, pocketUv.getY(i) * 0.2);
  }
  vest.add(new THREE.Mesh(pocketGeometry, pocketFabric));
  const welt = new THREE.CatmullRomCurve3(
    Array.from({ length: 19 }, (_, i) => pocket(i / 18, 1)),
  );
  vest.add(
    new THREE.Mesh(new THREE.TubeGeometry(welt, 24, 0.014, 8, false), seam),
  );

  const zip = (v: number) => {
    const p = front.atHeight(0, lerp(front.hem(0), front.edge(0).y, v));
    p.z += 0.014;
    return p;
  };
  vest.add(
    new THREE.Mesh(
      patch(
        (u, v) => {
          const p = zip(v);
          p.x = (u - 0.5) * 0.063;
          return p;
        },
        1,
        40,
      ),
      binding,
    ),
  );
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
      const print = patch(
        (u, v) => {
          const p = front.atHeight(lerp(0.42, 0.18, u), lerp(0.16, 0.27, v));
          p.x = -p.x - 0.002;
          p.z += 0.004;
          return p;
        },
        14,
        4,
      );
      vest.add(
        new THREE.Mesh(
          print,
          new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            roughness: 1,
          }),
        ),
      );
    }
  }
  vest.add(new THREE.Mesh(pad, binding));
  const cablePath = new THREE.CatmullRomCurve3([
    cableExit,
    cableExit.clone().add(new THREE.Vector3(0, 0.065, 0.025)),
    ...[
      [0, 0.84],
      [0.12, 0.88],
      [0.27, 1.08],
      [0.4, 1.32],
    ].map(([u, y]) => {
      const p = back.atHeight(u, y);
      p.z -= 0.012;
      return p;
    }),
  ]);
  vest.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(cablePath, 30, 0.014, 6, false),
      binding,
    ),
  );
  return zip;
}
