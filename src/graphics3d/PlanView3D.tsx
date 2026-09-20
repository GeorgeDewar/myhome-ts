import { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { PlanContext } from "../context/PlanContext";

export const PlanView3D = () => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ color: "#8AC" });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);


    if (plan) {
        const walls = plan.getWallsOnLevel(0); // Example: get walls on level 0
        for (const wall of walls) {
            const shape = new THREE.Shape();
            shape.moveTo(wall.from.x.metres, wall.to.y.metres);
            for (const point of wall.basicPolygon2D()) {
                shape.lineTo(point.x.metres, point.y.metres);
            }
            const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.4 });
            const material = new THREE.MeshPhongMaterial({ color: "#8AC" });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.y = 2.4;
            scene.add(mesh);
        }
    }


    const skyColor = 0xb1e1ff; // light blue
    const groundColor = 0xb97a20; // brownish orange
    const intensity = 1;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    scene.add(light);

    camera.position.y = 15;
    camera.position.z = 45;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current! });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // document.body.appendChild( renderer.domElement );

    function animate(time: number) {
      cube.rotation.x = time / 2000;
      cube.rotation.y = time / 1000;
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(animate);

    return () => {
      // Critical cleanup to avoid context collisions
      renderer.dispose();
    };
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} width="1000px" height="800px"></canvas>
    </div>
  );
};
