import { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { PlanContext } from "../context/PlanContext";
import { isSelectionTarget, type SelectionState, type SelectionTarget } from "../gui/selection";
import type { Room } from "../model/Room";
import { createPlanGeometry, disposePlanGeometry, highlightSelection } from "./planGeometry";

export type PlanView3DStatus = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
};

export const PlanView3D = ({
  onStatusChange,
  selection,
  onSelectionChange,
  onToggleRoom,
  onEdit,
  onContextMenu,
  version,
}: {
  onStatusChange: (status: PlanView3DStatus) => void;
  selection: SelectionState;
  onSelectionChange: (selection: SelectionState) => void;
  onToggleRoom: (room: Room) => void;
  onEdit: (target: SelectionTarget) => void;
  onContextMenu: (target: SelectionTarget, x: number, y: number) => boolean;
  version: number;
}) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const hasFittedRef = useRef(false);
  const selectionRef = useRef(selection);
  const contextMenuRef = useRef(onContextMenu);

  useEffect(() => {
    contextMenuRef.current = onContextMenu;
  }, [onContextMenu]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;

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
    const raycaster = new THREE.Raycaster();
    const targetsAt = (event: MouseEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const position = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      );
      raycaster.setFromCamera(position, camera);
      return raycaster
        .intersectObjects(planGroupRef.current?.children ?? [], true)
        .map((hit): SelectionTarget | undefined => hit.object.userData.target)
        .filter((target): target is SelectionTarget => target !== undefined);
    };
    const lockControls = (event: MouseEvent) => {
      if (!controls.isLocked) {
        const target = targetsAt(event)[0];
        if (event.ctrlKey || event.metaKey) {
          if (target?.kind === "room") onToggleRoom(target.item);
          return;
        }
        onSelectionChange(target ? { targets: [target], activeIndex: 0 } : { targets: [], activeIndex: -1 });
        controls.lock();
      }
    };
    const edit = (event: MouseEvent) => {
      const target = targetsAt(event)[0];
      if (target) onEdit(target);
    };
    const contextMenu = (event: MouseEvent) => {
      const current = selectionRef.current;
      const active = current.targets[current.activeIndex];
      const hits = targetsAt(event);
      const target = hits.find((candidate) => active && isSelectionTarget(active, candidate)) ??
        hits.find((candidate) => candidate.kind === "room" && current.rooms?.includes(candidate.item));
      if (target) {
        if (contextMenuRef.current(target, event.clientX, event.clientY)) event.preventDefault();
      }
    };
    const updatePressedKeys = (event: KeyboardEvent) => {
      if (
        controls.isLocked &&
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
    canvas.addEventListener("dblclick", edit);
    canvas.addEventListener("contextmenu", contextMenu);
    document.addEventListener("keydown", updatePressedKeys);
    document.addEventListener("keyup", clearPressedKey);
    document.addEventListener("mousemove", reportMouseLook);
    window.addEventListener("blur", clearPressedKeys);
    controls.addEventListener("unlock", clearPressedKeys);

    const planGroup = new THREE.Group();
    planGroupRef.current = planGroup;
    scene.add(planGroup);

    const grid = new THREE.GridHelper(100, 100, "#d9e2ec", "#d9e2ec");
    scene.add(grid);

    const light = new THREE.HemisphereLight(0xffffff, 0x999999, 2);
    scene.add(light);

    camera.position.y = 15;
    camera.position.z = 45;
    camera.lookAt(0, 0, 0);
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
      const distance = previousTime === 0 ? 0 : movementSpeed * Math.min((time - previousTime) / 1000, 0.1);
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

      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(animate);

    return () => {
      // Critical cleanup to avoid context collisions
      canvas.removeEventListener("click", lockControls);
      canvas.removeEventListener("dblclick", edit);
      canvas.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("keydown", updatePressedKeys);
      document.removeEventListener("keyup", clearPressedKey);
      document.removeEventListener("mousemove", reportMouseLook);
      window.removeEventListener("blur", clearPressedKeys);
      controls.removeEventListener("unlock", clearPressedKeys);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.setAnimationLoop(null);
      grid.geometry.dispose();
      if (Array.isArray(grid.material)) grid.material.forEach((item) => item.dispose());
      else grid.material.dispose();
      planGroupRef.current = null;
      cameraRef.current = null;
      hasFittedRef.current = false;
      renderer.dispose();
    };
  }, [onEdit, onSelectionChange, onStatusChange, onToggleRoom]);

  useEffect(() => {
    const group = planGroupRef.current;
    if (!plan || !group) return;
    const geometry = createPlanGeometry(plan);
    group.add(geometry);
    const camera = cameraRef.current;
    const bounds = new THREE.Box3().setFromObject(geometry);
    if (camera && !hasFittedRef.current && !bounds.isEmpty()) {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const verticalAngle = THREE.MathUtils.degToRad(camera.fov) / 2;
      const horizontalAngle = Math.atan(Math.tan(verticalAngle) * camera.aspect);
      const distance = Math.max(1, (sphere.radius / Math.sin(Math.min(verticalAngle, horizontalAngle))) * 1.15);
      camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance));
      camera.far = Math.max(1000, distance * 6);
      camera.lookAt(sphere.center);
      camera.updateProjectionMatrix();
      hasFittedRef.current = true;
      onStatusChange({
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        rotation: {
          x: THREE.MathUtils.radToDeg(camera.rotation.x),
          y: THREE.MathUtils.radToDeg(camera.rotation.y),
          z: THREE.MathUtils.radToDeg(camera.rotation.z),
        },
      });
    }

    return () => {
      group.remove(geometry);
      disposePlanGeometry(geometry);
    };
  }, [plan, version, onStatusChange]);

  useEffect(() => {
    selectionRef.current = selection;
    if (planGroupRef.current) highlightSelection(planGroupRef.current, selection);
  }, [selection, version]);

  return <canvas className="plan-view-3d" ref={canvasRef} />;
};
