import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildProduct } from "./geometry";
import type { ComponentId, ProductView, ViewerAction } from "./components";
export function createProductViewer(
  host: HTMLDivElement,
  onSelect: (id: ComponentId) => void,
  onFailure: () => void,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", {
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  if (!context) throw new Error("WebGL 2 indisponível neste dispositivo.");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf0f5f9, 0);
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "group");
  canvas.setAttribute(
    "aria-label",
    "Modelo 3D do colete. Setas giram; mais e menos aproximam; Home centraliza. Shift e setas reposicionam.",
  );
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 25;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  const product = buildProduct();
  scene.add(product.root);
  scene.add(new THREE.HemisphereLight(0xe8f5ff, 0x78909f, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(4, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa3d9f7, 2);
  rim.position.set(-4, 1, -3);
  scene.add(rim);
  const selection = new THREE.BoxHelper(product.parts.get("vest")!, 0x1684bf);
  scene.add(selection);
  let selected: ComponentId = "vest",
    view: ProductView = "external",
    disposed = false;
  const render = () => {
    if (!disposed) {
      selection.setFromObject(product.parts.get(selected)!);
      selection.visible = selected !== "vest";
      renderer.render(scene, camera);
    }
  };
  function reset() {
    product.root.rotation.set(0, 0, 0);
    product.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    product.root.traverseVisible((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox)
          bounds.union(
            object.geometry.boundingBox
              .clone()
              .applyMatrix4(object.matrixWorld),
          );
      }
    });
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const size = bounds.getSize(new THREE.Vector3());
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance =
      Math.max(size.y / (2 * tangent), size.x / (2 * tangent * camera.aspect)) *
        1.18 +
      size.z / 2;
    controls.target.copy(sphere.center);
    camera.position
      .copy(sphere.center)
      .add(
        new THREE.Vector3(0.22, 0.08, 1).normalize().multiplyScalar(distance),
      );
    controls.maxDistance = Math.max(25, distance * 1.5);
    controls.update();
    render();
  }
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    reset();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  controls.addEventListener("change", render);
  function act(action: ViewerAction) {
    if (action === "reset") {
      reset();
      return;
    }
    if (action === "zoom-in" || action === "zoom-out") {
      const offset = camera.position.clone().sub(controls.target);
      const next = THREE.MathUtils.clamp(
        offset.length() * (action === "zoom-in" ? 0.85 : 1.18),
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position.copy(controls.target).add(offset.setLength(next));
    } else {
      product.root.rotation[
        action === "left" || action === "right" ? "y" : "x"
      ] += action === "left" || action === "up" ? -0.18 : 0.18;
    }
    product.root.updateMatrixWorld(true);
    controls.update();
    render();
  }
  const keydown = (event: KeyboardEvent) => {
    const actions: Record<string, ViewerAction> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      "+": "zoom-in",
      "=": "zoom-in",
      "-": "zoom-out",
      Home: "reset",
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      const right = new THREE.Vector3().setFromMatrixColumn(
        camera.matrixWorld,
        0,
      );
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const move = (
        event.key === "ArrowLeft" || event.key === "ArrowRight" ? right : up
      ).multiplyScalar(
        event.key === "ArrowLeft" || event.key === "ArrowDown" ? -0.15 : 0.15,
      );
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
      render();
    } else act(action);
  };
  canvas.addEventListener("keydown", keydown);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = { x: 0, y: 0 };
  const pointerdown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY };
  };
  const pointerup = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(product.root, true).find((hit) => {
      let p: THREE.Object3D | null = hit.object;
      while (p) {
        if (!p.visible) return false;
        p = p.parent;
      }
      return true;
    });
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.componentId) object = object.parent;
    if (object?.userData.componentId) onSelect(object.userData.componentId);
  };
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("pointerup", pointerup);
  const lost = (event: Event) => {
    event.preventDefault();
    onFailure();
  };
  canvas.addEventListener("webglcontextlost", lost);
  resize();
  return {
    act,
    update(nextView: ProductView, nextSelected: ComponentId) {
      const changed = view !== nextView;
      view = nextView;
      selected = nextSelected;
      product.setView(view);
      product.root.updateMatrixWorld(true);
      if (changed) reset();
      else render();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("pointerdown", pointerdown);
      canvas.removeEventListener("pointerup", pointerup);
      canvas.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          geometries.add(object.geometry);
          const list = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of list) {
            materials.add(material);
            for (const value of Object.values(material))
              if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.add(product.texture);
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
export type ProductViewer = ReturnType<typeof createProductViewer>;
