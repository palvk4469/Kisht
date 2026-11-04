import { describe, expect, it } from "vitest";
import { distanceMeters } from "./geo.ts";

describe("distanceMeters", () => {
  it("is zero at the same point", () => {
    expect(distanceMeters({ lat: 22.72, lng: 75.86 }, { lat: 22.72, lng: 75.86 })).toBe(0);
  });

  it("measures Indore to Pithampur at about 27 km", () => {
    const d = distanceMeters({ lat: 22.7196, lng: 75.8577 }, { lat: 22.6127, lng: 75.6821 });
    expect(d).toBeGreaterThan(20_000);
    expect(d).toBeLessThan(30_000);
  });

  it("resolves a short walk", () => {
    const d = distanceMeters({ lat: 22.72, lng: 75.86 }, { lat: 22.7209, lng: 75.86 });
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});
