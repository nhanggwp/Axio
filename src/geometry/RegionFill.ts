import { labelSchema } from "../../shared/actions";
import type { GGBApi } from "../types/geogebra";
import { circleGeometry } from "./CircleBoundary";
import { geometryNames } from "../../shared/geometryNames";

export function circleBoundaryPoints(api: GGBApi, circle: string): string[] {
  const geometry = circleGeometry(api, circle);
  if (!geometry) return [];
  return api
    .getAllObjectNames("point")
    .filter(
      (name) =>
        api.isDefined(name) &&
        Math.abs(
          Math.hypot(
            api.getXcoord(name) - geometry.x,
            api.getYcoord(name) - geometry.y,
          ) - geometry.r,
        ) <=
          1e-6 * Math.max(1, geometry.r),
    );
}

/** Keep the native circle as a dependency; never replace it or sample its arc. */
export function circularRegionArguments(
  api: GGBApi,
  refs: string[],
  part: "minor" | "major",
): string[] {
  const [circle, a, b] = refs;
  if (
    refs.length !== 3 ||
    !refs.every((name) => labelSchema.safeParse(name).success)
  )
    throw new Error("Chọn một đường tròn và hai điểm trên đường tròn.");
  const points = circleBoundaryPoints(api, circle);
  if (
    a === b ||
    !points.includes(a) ||
    !points.includes(b) ||
    Math.hypot(
      api.getXcoord(a) - api.getXcoord(b),
      api.getYcoord(a) - api.getYcoord(b),
    ) < 1e-9
  )
    throw new Error(
      "Hai đầu cung phải là hai điểm phân biệt nằm trên đường tròn đã chọn.",
    );
  const center = `Center(${circle})`;
  const cross = `(x(${a})-x(${center}))*(y(${b})-y(${center}))-(y(${a})-y(${center}))*(x(${b})-x(${center}))`;
  const forward = `${cross}${part === "minor" ? ">=" : "<"}0`;
  // ClosestPoint keeps the radius tied to the circle even for free endpoints.
  const first = `ClosestPoint(${circle},${a})`,
    second = `ClosestPoint(${circle},${b})`;
  return [
    center,
    `If(${forward},${first},${second})`,
    `If(${forward},${second},${first})`,
  ];
}

export function circularRegionInfo(api: GGBApi, name: string) {
  const marker = api
    .getCaption(name, false)
    .match(/^axio-region:(circular_segment|circular_sector):(minor|major)$/);
  if (!marker) return null;
  const refs = [
    ...new Set(
      geometryNames(api.getCommandString(name, false)).filter((n) =>
        api.exists(n),
      ),
    ),
  ];
  const circle = refs.find((n) => api.getObjectType(n) === "circle"),
    points = refs.filter((n) => api.getObjectType(n) === "point");
  if (!circle || points.length < 2) return null;
  return {
    kind: marker[1],
    part: marker[2],
    circle,
    points: points.slice(0, 2),
  };
}

/** Approximation for selection bounds only; drawing and export stay native. */
export function circularRegionOutline(
  api: GGBApi,
  name: string,
): { x: number; y: number }[] | null {
  const region = circularRegionInfo(api, name);
  if (!region) return null;
  const { circle, points } = region;
  const g = circleGeometry(api, circle);
  if (!g) return null;
  let start = Math.atan2(
    api.getYcoord(points[0]) - g.y,
    api.getXcoord(points[0]) - g.x,
  );
  const end = Math.atan2(
    api.getYcoord(points[1]) - g.y,
    api.getXcoord(points[1]) - g.x,
  );
  const tau = 2 * Math.PI;
  let sweep = (((end - start) % tau) + tau) % tau;
  if (
    (region.part === "minor" && sweep > Math.PI) ||
    (region.part === "major" && sweep < Math.PI)
  ) {
    start = end;
    sweep = tau - sweep;
  }
  const outline = Array.from({ length: 129 }, (_, i) => ({
    x: g.x + g.r * Math.cos(start + (sweep * i) / 128),
    y: g.y + g.r * Math.sin(start + (sweep * i) / 128),
  }));
  return region.kind === "circular_sector"
    ? [{ x: g.x, y: g.y }, ...outline]
    : outline;
}
