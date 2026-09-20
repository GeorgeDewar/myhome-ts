export class Distance {
    constructor(public metres: number) { }

    static fromJson(json: number) {
        return new Distance(json / 1000.0);
    }

    plus(other: Distance) {
        return new Distance(this.metres + other.metres);
    }

    minus(other: Distance) {
        return new Distance(this.metres - other.metres);
    }

    divideBy(divisor: number) {
        return new Distance(this.metres / divisor);
    }

    times(factor: number) {
        return new Distance(this.metres * factor);
    }
}