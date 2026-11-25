import { describe, expect, it } from "vitest";
import { mapScales, planToGeographic, referenceAt } from "./georeference";
import { Plan } from "../model/Plan";
import { PlanEditor } from "../model/PlanEditor";

describe("georeferencing", () => {
  it("uses ellipsoidal ground scales at the site", () => {
    const scales = mapScales(-41.178);
    expect(scales.east).toBeCloseTo(1.326678, 5);
    expect(scales.north).toBeCloseTo(1.331743, 5);
  });

  it("keeps the geographic position of the pivot fixed when rotating", () => {
    const point = { x: 25.123, y: -15.456 };
    const original = referenceAt(point, -41.178, 174.82, 0);
    const rotated = referenceAt(point, -41.178, 174.82, 57);
    expect(planToGeographic(original, point).latitude).toBeCloseTo(-41.178, 9);
    expect(planToGeographic(rotated, point).latitude).toBeCloseTo(-41.178, 9);
    expect(planToGeographic(rotated, point).longitude).toBeCloseTo(174.82, 9);
    expect(rotated.longitude).not.toBeCloseTo(original.longitude, 6);
  });

  it.each([
    [-90, 270],
    [360, 0],
    [-360, 0],
    [725, 5],
    [359.999, 359.999],
  ])("normalizes bearing %s to %s while preserving the pivot", (bearing, expected) => {
    const point = { x: 25.123, y: -15.456 };
    const reference = referenceAt(point, -41.178, 174.82, bearing);
    expect(reference.bearing).toBe(expected);
    expect(planToGeographic(reference, point).latitude).toBeCloseTo(-41.178, 9);
    expect(planToGeographic(reference, point).longitude).toBeCloseTo(174.82, 9);
  });

  it.each([
    [-0.1, false],
    [0, true],
    [359.999, true],
    [360, false],
  ])("enforces the saved bearing range for %s", (bearing, valid) => {
    const reference = { latitude: -41.178, longitude: 174.82, bearing };
    const loaded = Plan.fromJson({ georeference: reference });
    expect(loaded.georeference).toEqual(valid ? reference : undefined);
    expect(loaded.loadWarnings).toHaveLength(valid ? 0 : 1);
    const plan = new Plan();
    expect(new PlanEditor(plan, () => {}).updateGeoreference(reference).ok).toBe(valid);
    expect(plan.georeference).toEqual(valid ? reference : undefined);
  });

  it("saves georeferencing and ignores invalid georeferencing without losing the plan", () => {
    const georeference = { latitude: -41.178, longitude: 174.82, bearing: 25 };
    const plan = Plan.fromJson({ georeference, fences: [{ id: "f", start: [0, 0], end: [1000, 0] }] });
    expect(Plan.fromJson(plan.toJson()).georeference).toEqual(georeference);
    const invalid = Plan.fromJson({ georeference: { ...georeference, latitude: 90 }, fences: plan.toJson().fences });
    expect(invalid.georeference).toBeUndefined();
    expect(invalid.fences).toHaveLength(1);
    expect(invalid.loadWarnings).toHaveLength(1);
  });
});
