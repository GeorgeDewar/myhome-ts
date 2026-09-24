import { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { PlanContext } from "../context/PlanContext";

export const PlanView3D = () => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ color: "#8AC" });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const controls = new PointerLockControls(camera, document.body);
    const pressedKeys = new Set<string>();
    const movementSpeed = 6;

    // Click anywhere on the page to lock the mouse and start looking around
    const lockControls = () => controls.lock();
    const updatePressedKeys = (event: KeyboardEvent) => {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ShiftLeft",
          "ShiftRight",
          "ControlLeft",
          "ControlRight",
        ].includes(event.code)
      ) {
        pressedKeys.add(event.code);
      }
    };
    const clearPressedKey = (event: KeyboardEvent) => {
      pressedKeys.delete(event.code);
    };
    const clearPressedKeys = () => pressedKeys.clear();

    document.addEventListener("click", lockControls);
    document.addEventListener("keydown", updatePressedKeys);
    document.addEventListener("keyup", clearPressedKey);
    window.addEventListener("blur", clearPressedKeys);

    if (plan) {
      const walls = plan.getWallsOnLevel(0); // Example: get walls on level 0
      for (const wall of walls) {
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
        scene.add(mesh);
      }
    }

    const grid = new THREE.GridHelper(100, 100, "#d9e2ec", "#d9e2ec");
    scene.add(grid);

    const skyColor = 0xb1e1ff; // light blue
    const groundColor = 0xb97a20; // brownish orange
    const intensity = 1;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    scene.add(light);

    camera.position.y = 15;
    camera.position.z = 45;

    scene.add(controls.object);

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current! });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // document.body.appendChild( renderer.domElement );

    let previousTime = 0;
    function animate(time: number) {
      const distance = (movementSpeed * (time - previousTime)) / 1000;
      previousTime = time;

      if (controls.isLocked) {
        if (pressedKeys.has("KeyW")) controls.moveForward(distance);
        if (pressedKeys.has("KeyS")) controls.moveForward(-distance);
        if (pressedKeys.has("KeyA")) controls.moveRight(-distance);
        if (pressedKeys.has("KeyD")) controls.moveRight(distance);
        if (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")) {
          camera.position.y += distance;
        }
        if (pressedKeys.has("ControlLeft") || pressedKeys.has("ControlRight")) {
          camera.position.y -= distance;
        }
      }

      cube.rotation.x = time / 2000;
      cube.rotation.y = time / 1000;
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(animate);

    return () => {
      // Critical cleanup to avoid context collisions
      document.removeEventListener("click", lockControls);
      document.removeEventListener("keydown", updatePressedKeys);
      document.removeEventListener("keyup", clearPressedKey);
      window.removeEventListener("blur", clearPressedKeys);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} width="1000px" height="800px"></canvas>
    </div>
  );
};
