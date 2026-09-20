import { Distance } from "./Distance";

export class Vector2D {
    constructor(public dX: Distance, public dY: Distance) { }

    length(): Distance {
        return new Distance(Math.sqrt(this.dX.metres * this.dX.metres + this.dY.metres * this.dY.metres));
    }

    unit(): Vector2D {
        const len = this.length().metres;
        return new Vector2D(this.dX.divideBy(len), this.dY.divideBy(len));
    }

    normal(): Vector2D {
        return new Vector2D(this.dY.times(-1), this.dX);
    }

    times(factor: number): Vector2D {
        return new Vector2D(this.dX.times(factor), this.dY.times(factor));
    }
}