import type { Wall } from "../model/Wall";

export class WallRenderer {
    constructor(private ctx: CanvasRenderingContext2D) {}

    private offset = [-200, 200]; // px
    private scale = 0.020; // px per mm

    renderWall (wall: Wall) {
        console.log(`Rendering wall from (${wall.from.x}, ${wall.from.y}) to (${wall.to.x}, ${wall.to.y}) with thickness ${wall.thickness}`);
        this.ctx.fillStyle = 'blue';
        this.ctx.lineWidth = wall.thickness * this.scale;
        this.ctx.beginPath();
        this.ctx.moveTo(wall.from.x * this.scale + this.offset[0], wall.from.y * this.scale + this.offset[1]);
        this.ctx.lineTo(wall.to.x * this.scale + this.offset[0], wall.to.y * this.scale + this.offset[1]);
        this.ctx.stroke();
    }
}