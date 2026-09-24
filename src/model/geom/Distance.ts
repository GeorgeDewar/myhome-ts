export class Distance {
  constructor(public metres: number) {}

  static fromJson(json: number) {
    return new Distance(json / 1000.0);
  }

  toJson() {
    return Number((this.metres * 1000).toFixed(9));
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
