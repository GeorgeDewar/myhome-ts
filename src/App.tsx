import { useEffect } from 'react';
import './App.css';
import { PlanContext } from './context/PlanContext';
import { PlanView3D } from './graphics3d/PlanView3D';
import type { JsonPlan } from './model/json/Document';
import { Plan } from './model/Plan';
import testPlan from './testData/McKeefry.json';
  
function App() {
  // const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // const canvas = canvasRef.current;
    // const ctx = canvas?.getContext('2d');
    // if (!ctx) {
    //   return;
    // }

        console.log('Hello');
    const jsonPlan = testPlan as JsonPlan;
    const plan = Plan.fromJson(jsonPlan);
    const house = plan.buildings[0];
    const level = house.levels[0];
    console.log(plan);
    // const wallRenderer = new WallRenderer(ctx);
    // for (const docWall of level.walls) {
    //   const wall = Wall.fromJson(docWall);
    //   wallRenderer.renderWall(wall);
    // }
  }, []);

  return (
    <main>
      <h1>Hello World</h1>
      <PlanContext value={testPlan as JsonPlan}>
        <PlanView3D />
      </PlanContext>
    
      {/* <canvas ref={canvasRef} width="1000px" height="800px"></canvas> */}
    </main>
  )
}

export default App
