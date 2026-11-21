import { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { PlanContext } from "../context/PlanContext";

export type PlanView3DStatus = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
};

export const PlanView3D = ({
  level,
  onStatusChange,
  version,
}: {
  level: number;
  onStatusChange: (status: PlanView3DStatus) => void;
  version: number;
}) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wallsRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ color: "#8AC" });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const controls = new PointerLockControls(camera, canvas);
    const pressedKeys = new Set<string>();
    const movementSpeed = 6;
    const reportStatus = () => {
      onStatusChange({
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        rotation: {
          x: THREE.MathUtils.radToDeg(camera.rotation.x),
          y: THREE.MathUtils.radToDeg(camera.rotation.y),
          z: THREE.MathUtils.radToDeg(camera.rotation.z),
        },
      });
    };

    // Click the 3D view to lock the pointer and start looking around.
    const lockControls = () => controls.lock();
    const updatePressedKeys = (event: KeyboardEvent) => {
      if (
        ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(event.code)
      ) {
        pressedKeys.add(event.code);
      }
    };
    const clearPressedKey = (event: KeyboardEvent) => {
      pressedKeys.delete(event.code);
    };
    const clearPressedKeys = () => pressedKeys.clear();
    const reportMouseLook = () => {
      if (controls.isLocked) reportStatus();
    };

    canvas.addEventListener("click", lockControls);
    document.addEventListener("keydown", updatePressedKeys);
    document.addEventListener("keyup", clearPressedKey);
    document.addEventListener("mousemove", reportMouseLook);
    window.addEventListener("blur", clearPressedKeys);

    const walls = new THREE.Group();
    wallsRef.current = walls;
    scene.add(walls);

    const grid = new THREE.GridHelper(100, 100, "#d9e2ec", "#d9e2ec");
    scene.add(grid);

    const skyColor = 0xb1e1ff; // light blue
    const groundColor = 0xb97a20; // brownish orange
    const intensity = 1;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    scene.add(light);

    camera.position.y = 15;
    camera.position.z = 45;
    reportStatus();

    scene.add(controls.object);

    const renderer = new THREE.WebGLRenderer({ canvas });
    const resizeRenderer = () => {
      const { clientHeight, clientWidth } = renderer.domElement;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
    };
    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(renderer.domElement);
    resizeRenderer();

    let previousTime = 0;
    function animate(time: number) {
      const distance = (movementSpeed * (time - previousTime)) / 1000;
      previousTime = time;

      if (controls.isLocked) {
        let moved = false;
        if (pressedKeys.has("KeyW")) {
          controls.moveForward(distance);
          moved = true;
        }
        if (pressedKeys.has("KeyS")) {
          controls.moveForward(-distance);
          moved = true;
        }
        if (pressedKeys.has("KeyA")) {
          controls.moveRight(-distance);
          moved = true;
        }
        if (pressedKeys.has("KeyD")) {
          controls.moveRight(distance);
          moved = true;
        }
        if (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")) {
          camera.position.y += distance;
          moved = true;
        }
        if (pressedKeys.has("ControlLeft") || pressedKeys.has("ControlRight")) {
          camera.position.y -= distance;
          moved = true;
        }
        if (moved) reportStatus();
      }

      cube.rotation.x = time / 2000;
      cube.rotation.y = time / 1000;
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(animate);

    return () => {
      // Critical cleanup to avoid context collisions
      canvas.removeEventListener("click", lockControls);
      document.removeEventListener("keydown", updatePressedKeys);
      document.removeEventListener("keyup", clearPressedKey);
      document.removeEventListener("mousemove", reportMouseLook);
      window.removeEventListener("blur", clearPressedKeys);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.setAnimationLoop(null);
      geometry.dispose();
      material.dispose();
      grid.geometry.dispose();
      if (Array.isArray(grid.material)) grid.material.forEach((item) => item.dispose());
      else grid.material.dispose();
      wallsRef.current = null;
      renderer.dispose();
    };
  }, [onStatusChange]);

  useEffect(() => {
    const group = wallsRef.current;
    if (!plan || !group) return;
    const meshes: THREE.Mesh[] = [];
    for (const wall of plan.getWallsOnLevel(level)) {
      if (wall.virtual) continue;
      const shape = new THREE.Shape();
      shape.moveTo(wall.from.x.metres, wall.from.y.metres);
      for (const point of wall.basicPolygon2D()) {
        shape.lineTo(point.x.metres, point.y.metres);
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
      const material = new THREE.MeshPhongMaterial({ color: "#8AC" });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 2.4;
      group.add(mesh);
      meshes.push(mesh);
    }

    return () => {
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((item) => item.dispose());
        else mesh.material.dispose();
      }
    };
  }, [level, plan, version, onStatusChange]);

  return <canvas className="plan-view-3d" ref={canvasRef} />;
};
