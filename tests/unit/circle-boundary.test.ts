import { describe, expect, it } from "vitest";
import { projectOnCircle } from "../../src/geometry/CircleBoundary";
describe("circle point dragging", () => {
  it("changes only angular position even when the pointer is far inside or outside", () => {
    const circle = { x: 7, y: -3, r: 4 };
    for (const scale of [0.001, 0.5, 1, 20]) {
      const p = projectOnCircle(
        circle,
        circle.x + 3 * scale,
        circle.y + 4 * scale,
      )!;
      expect(p.x).toBeCloseTo(9.4, 10);
      expect(p.y).toBeCloseTo(0.2, 10);
      expect(Math.hypot(p.x - circle.x, p.y - circle.y)).toBeCloseTo(4, 10);
    }
  });
  it("does not pick an arbitrary angular jump when the pointer reaches the center", () => {
    expect(projectOnCircle({ x: 7, y: -3, r: 4 }, 7, -3)).toBeNull();
    expect(projectOnCircle({ x: 7, y: -3, r: 4 }, NaN, 2)).toBeNull();
  });
});
