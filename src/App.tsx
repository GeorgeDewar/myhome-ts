import { useEffect, useRef } from 'react';
import './App.css';
import { WallRenderer } from './graphics2d/WallRenderer';
import { Wall } from './model/Wall';
import { McKeefry } from './testData/mckeefry';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) {
      return;
    }

    const plan = McKeefry;
    const house = plan.buildings[0];
    const floor = house.floors[0];
    const wallRenderer = new WallRenderer(ctx);
    for (const docWall of floor.walls) {
      const wall = Wall.fromJson(docWall);
      wallRenderer.renderWall(wall);
    }
  }, []);

  return (
    <main>
      <h1>Hello World</h1>
      <canvas ref={canvasRef} width="1000px" height="800px"></canvas>
    </main>
  )
}

export default App
