export class Distance {
  constructor(public metres: number) {}

  static fromJson(json: number) {
    return new Distance(json / 1000.0);
  }

  toJson() {
    return Number((this.metres * 1000).toFixed(9));
  }

  toPositionJson() {
    const value = Math.round(this.metres * 1000);
    if (!isValidPositionInMillimetres(value) || Distance.fromJson(value).metres !== this.metres) {
      throw new Error("Position must be an accurately representable integer number of millimetres.");
    }
    return value;
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

export const isValidPositiveDistance = (millimetres: number) =>
  Number.isFinite(millimetres) && millimetres > 0 && Distance.fromJson(millimetres).toJson() > 0;

export const isValidPositionInMillimetres = (millimetres: number) =>
  Number.isSafeInteger(millimetres) && Distance.fromJson(millimetres).toJson() === millimetres;
