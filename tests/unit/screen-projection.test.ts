import { describe, it, expect } from "vitest";
import { hitObject } from "../../src/geometry/ScreenProjection";
describe("decoration hit testing", () => {
  const angle = {
    name: "alpha",
    kind: "angle" as const,
    center: { x: 100, y: 100 },
    rx: 30,
    startAngle: Math.PI,
    sweep: Math.PI / 2,
    points: [],
    bounds: { left: 70, right: 100, top: 70, bottom: 100 },
  };
  const vertex = {
    name: "B",
    kind: "point" as const,
    points: [{ x: 100, y: 100 }],
    bounds: { left: 100, right: 100, top: 100, bottom: 100 },
  };
  it("selects the drawn sector outside the point hit radius, across angle wrap", () => {
    expect(hitObject([vertex, angle], { x: 79, y: 79 })).toBe("alpha");
    expect(hitObject([vertex, angle], { x: 100, y: 100 })).toBe("B");
    expect(hitObject([vertex, angle], { x: 121, y: 121 })).toBeNull();
    expect(hitObject([vertex, angle], { x: 50, y: 50 })).toBeNull();
  });
  it("handles clockwise and reflex sweeps without a hit in the excluded sector", () => {
    expect(
      hitObject([{ ...angle, startAngle: Math.PI / 2, sweep: -Math.PI / 2 }], {
        x: 121,
        y: 121,
      }),
    ).toBe("alpha");
    const reflex = { ...angle, startAngle: 0, sweep: Math.PI * 1.5 };
    expect(hitObject([reflex], { x: 79, y: 79 })).toBe("alpha");
    expect(hitObject([reflex], { x: 121, y: 79 })).toBeNull();
  });
  it("selects visible text over polygon fill while keeping vertex priority", () => {
    const label = {
      name: "distance",
      kind: "text" as const,
      points: [],
      bounds: { left: 80, right: 160, top: 80, bottom: 104 },
    };
    const polygon = {
      name: "ABC",
      kind: "polygon" as const,
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ],
      bounds: { left: 0, right: 200, top: 0, bottom: 200 },
    };
    expect(hitObject([label, polygon], { x: 145, y: 90 })).toBe("distance");
    expect(hitObject([label, polygon, vertex], { x: 100, y: 100 })).toBe("B");
    expect(hitObject([label], { x: 180, y: 90 })).toBeNull();
  });
});
