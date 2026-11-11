import { nativeNumber } from "./nativeNumber";
import { geometryNames } from "../../shared/geometryNames";
import { labelSchema } from "../../shared/actions";
import type { GGBApi } from "../types/geogebra";

export type CircleGeometry = { x: number; y: number; r: number };
export type CircleBoundary = CircleGeometry & {
  name: string;
  vertices: string[];
};

export function circleGeometry(
  api: GGBApi,
  name: string,
): CircleGeometry | null {
  if (
    !api.exists(name) ||
    api.getObjectType(name) !== "circle" ||
    !api.isDefined(name)
  )
    return null;
  const matrix = new DOMParser()
    .parseFromString(api.getXML(name), "application/xml")
    .querySelector("matrix");
  if (!matrix) return null;
  const a = Number(matrix.getAttribute("A0"));
  const x = -Number(matrix.getAttribute("A4")) / a;
  const y = -Number(matrix.getAttribute("A5")) / a;
  const r = Math.sqrt(x * x + y * y - Number(matrix.getAttribute("A2")) / a);
  return [x, y, r].every(Number.isFinite) && r > 1e-9 ? { x, y, r } : null;
}

/** Only three-point circumcircles: a center/radius handle must still resize its circle. */
export function circumcircleBoundary(
  api: GGBApi,
  point: string,
): CircleBoundary | null {
  const candidates: CircleBoundary[] = [];
  for (const name of api.getAllObjectNames()) {
    if (!api.getVisible(name) || api.getObjectType(name) !== "circle") continue;
    const definition = api.getCommandString(name, false);
    if (!/^Circle[\[(]/.test(definition)) continue;
    const vertices = geometryNames(definition).slice(1);
    if (
      vertices.length !== 3 ||
      !vertices.includes(point) ||
      !vertices.every((n) => api.exists(n) && api.getObjectType(n) === "point")
    )
      continue;
    if (![name, ...vertices].every((n) => labelSchema.safeParse(n).success))
      continue;
    const geometry = circleGeometry(api, name);
    if (geometry) candidates.push({ name, vertices, ...geometry });
  }
  // Different boundaries through one vertex are ambiguous; never silently pick one.
  return candidates.length === 1 ? candidates[0] : null;
}

export function projectOnCircle(
  circle: CircleGeometry,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const dx = x - circle.x,
    dy = y - circle.y,
    length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-10 * Math.max(1, circle.r))
    return null;
  return {
    x: circle.x + (circle.r * dx) / length,
    y: circle.y + (circle.r * dy) / length,
  };
}

/** Reverse a legacy free triangle → circle into circle → movable path vertices. */
export function bindCircumcircleVertices(
  api: GGBApi,
  boundary: CircleBoundary,
): void {
  const vertices = boundary.vertices.map((name) => ({
    name,
    x: api.getXcoord(name),
    y: api.getYcoord(name),
    fixed: /<fixed\b[^>]*val="true"/.test(api.getXML(name)),
  }));
  const fixed = /<fixed\b[^>]*val="true"/.test(api.getXML(boundary.name));
  if (
    !api.evalCommand(
      `${boundary.name}=Circle((${nativeNumber(boundary.x)},${nativeNumber(boundary.y)}),${nativeNumber(boundary.r)})`,
    )
  )
    throw new Error("Không thể giữ đường tròn khi trượt điểm.");
  api.setFixed(boundary.name, fixed, true);
  for (const vertex of vertices) {
    if (!api.evalCommand(`${vertex.name}=Point(${boundary.name})`))
      throw new Error("Không thể gắn đỉnh vào đường tròn.");
    api.setFixed(vertex.name, false, true);
    api.setCoords(vertex.name, vertex.x, vertex.y);
    api.setFixed(vertex.name, vertex.fixed, true);
  }
  const actual = circleGeometry(api, boundary.name);
  if (
    !actual ||
    Math.hypot(actual.x - boundary.x, actual.y - boundary.y) >
      1e-7 * Math.max(1, boundary.r) ||
    Math.abs(actual.r - boundary.r) > 1e-7 * Math.max(1, boundary.r)
  ) {
    throw new Error("Đường tròn đã thay đổi; giữ nguyên hình trước thao tác.");
  }
}
