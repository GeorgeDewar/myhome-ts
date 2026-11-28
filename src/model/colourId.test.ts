import { describe, expect, it } from "vitest";
import { slugifyColourName, uniqueColourId } from "./colourId";

describe("colour IDs", () => {
  it("generates lowercase hyphenated IDs from names, dropping accents and punctuation", () => {
    expect(slugifyColourName("Fence Brown")).toBe("fence-brown");
    expect(slugifyColourName("  Sage Green (Exterior)! ")).toBe("sage-green-exterior");
    expect(slugifyColourName("Crème Brûlée")).toBe("creme-brulee");
    expect(slugifyColourName("!!!")).toBe("");
  });

  it("makes generated IDs unique", () => {
    expect(uniqueColourId("Fence Brown", ["fence-brown", "fence-brown-2"])).toBe("fence-brown-3");
    expect(uniqueColourId("Fence Brown", ["other"])).toBe("fence-brown");
    expect(uniqueColourId("???", [])).toBe("");
  });
});
