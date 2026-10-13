import { expect, it } from "vitest";
import { coverageCircle } from "./service-area";
it("draws a geographic 25km boundary rather than a screen-size circle", () => {
  const area = { id: "test", name: "TEST Dallas", latitude: 32.7767, longitude: -96.797, radiusKm: 25, active: true };
  const shape = coverageCircle(area)!;
  const ring = shape.geometry.coordinates[0]!;
  expect(ring).toHaveLength(129); expect(ring[0]).toEqual(ring.at(-1));
  for (const [lon, lat] of ring) {
    const rad = Math.PI / 180;
    const a = Math.sin((lat! - area.latitude) * rad / 2) ** 2 + Math.cos(area.latitude * rad) * Math.cos(lat! * rad) * Math.sin((lon! - area.longitude) * rad / 2) ** 2;
    expect(6371 * 2 * Math.asin(Math.sqrt(a))).toBeCloseTo(25, 7);
  }
  expect(shape.properties).toEqual({ id: "test", name: "TEST Dallas", active: true });
  for (const value of [{ ...area, radiusKm: 0 }, { ...area, radiusKm: NaN }, { ...area, latitude: 91 }, { ...area, longitude: Infinity }])
    expect(coverageCircle(value)).toBeNull();
});
