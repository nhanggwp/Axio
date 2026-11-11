import { geometryNames } from "../../shared/geometryNames";
import type { GeometryController } from "./GeometryController";
import { isPolygonType } from "./triangleVertices";
export type ScreenPoint = { x: number; y: number };
export type ScreenBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
type Shape = {
  name: string;
  points: ScreenPoint[];
  bounds: ScreenBounds;
  kind: "point" | "path" | "polygon" | "circle" | "angle" | "text";
  center?: ScreenPoint;
  rx?: number;
  ry?: number;
  startAngle?: number;
  sweep?: number;
};
const tau = 2 * Math.PI;
const positiveAngle = (a: number) => ((a % tau) + tau) % tau;
let textContext: CanvasRenderingContext2D | null | undefined;
const bounds = (points: ScreenPoint[]): ScreenBounds => ({
  left: Math.min(...points.map((p) => p.x)),
  right: Math.max(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  bottom: Math.max(...points.map((p) => p.y)),
});
const distance = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
function pointInPolygon(p: ScreenPoint, poly: ScreenPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
/** UI hit-testing only. Mathematical objects/coordinates come from GeoGebra. */
export function screenShapes(
  controller: GeometryController,
  host: HTMLElement,
): Shape[] {
  const api = controller.adapter.api,
    v = JSON.parse(api.getViewProperties(1)),
    rect = (
      host.querySelector(".EuclidianPanel") ?? host
    ).getBoundingClientRect();
  const project = (x: number, y: number): ScreenPoint => ({
    x: rect.left + (x - v.xMin) / v.invXscale,
    y: rect.top + v.height - (y - v.yMin) / v.invYscale,
  });
  const doc = new DOMParser().parseFromString(api.getXML(), "application/xml");
  const elements = new Map(
    [...doc.querySelectorAll("construction > element")].map((e) => [
      e.getAttribute("label")!,
      e,
    ]),
  );
  const point = (name: string) =>
    project(api.getXcoord(name), api.getYcoord(name));
  // Resolve native text anchors without evaluating commands or adding geometry.
  const anchor = (start: Element | null): ScreenPoint | null => {
    if (!start) return null;
    const exp = start.getAttribute("exp");
    if (exp && api.exists(exp) && api.getObjectType(exp) === "point")
      return point(exp);
    const midpoint = exp?.match(/^Midpoint[\[(]([^,]+),\s*([^\])]+)[\])]$/);
    if (
      midpoint &&
      midpoint
        .slice(1)
        .every((n) => api.exists(n) && api.getObjectType(n) === "point")
    ) {
      const [a, b] = midpoint.slice(1).map(point);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    if (start.hasAttribute("x") && start.hasAttribute("y")) {
      const z = Number(start.getAttribute("z") ?? 1);
      if (z)
        return project(
          Number(start.getAttribute("x")) / z,
          Number(start.getAttribute("y")) / z,
        );
    }
    return null;
  };
  const shapes: Shape[] = [];
  for (const o of controller.objects) {
    if (!o.visible || !api.isDefined(o.name)) continue;
    const el = elements.get(o.name);
    if (!el) continue;
    const refs = geometryNames(o.definition)
      .slice(1)
      .filter((n) => api.exists(n));
    const pointRefs = refs.filter((n) => api.getObjectType(n) === "point");
    let points: ScreenPoint[] = [];
    let kind: Shape["kind"] = "path";
    if (o.type === "point") {
      points = [point(o.name)];
      kind = "point";
    } else if (o.type === "text") {
      const absolute = el.querySelector("absoluteScreenLocation");
      const origin = absolute
        ? {
            x: rect.left + Number(absolute.getAttribute("x")),
            y: rect.top + Number(absolute.getAttribute("y")),
          }
        : anchor(el.querySelector("startPoint"));
      if (!origin) continue;
      textContext ??= document.createElement("canvas").getContext("2d");
      const font = el.querySelector("font");
      const baseSize = Number(
        doc.querySelector("gui font")?.getAttribute("size") ?? 16,
      );
      const fontSize = baseSize * Number(font?.getAttribute("sizeM") ?? 1);
      const style = Number(font?.getAttribute("style") ?? 0);
      if (textContext)
        textContext.font = `${style & 2 ? "italic " : ""}${style & 1 ? "bold " : ""}${fontSize}px ${font?.getAttribute("serif") === "true" ? "serif" : "sans-serif"}`;
      const lines = o.value.split("\n");
      const width = Math.max(
        ...lines.map(
          (line) =>
            textContext?.measureText(line).width ??
            line.length * fontSize * 0.6,
        ),
      );
      const offset = el.querySelector("labelOffset");
      const left = origin.x + Number(offset?.getAttribute("x") ?? 0);
      const bottom = origin.y + Number(offset?.getAttribute("y") ?? 0) + 4;
      shapes.push({
        name: o.name,
        kind: "text",
        points: [],
        bounds: {
          left: left - 5,
          right: left + width + 5,
          top: bottom - fontSize * 1.3 * lines.length - 4,
          bottom,
        },
      });
      continue;
    } else if (["segment", "vector"].includes(o.type) && pointRefs.length >= 2)
      points = pointRefs.slice(0, 2).map(point);
    else if (isPolygonType(o.type)) {
      points = pointRefs.map(point);
      for (const command of doc.querySelectorAll("construction > command")) {
        const output = command.querySelector("output");
        if (!output || ![...output.attributes].some((a) => a.value === o.name))
          continue;
        for (const a of output.attributes)
          if (
            api.exists(a.value) &&
            api.getObjectType(a.value) === "point" &&
            !pointRefs.includes(a.value)
          )
            points.push(point(a.value));
      }
      kind = "polygon";
    } else if (o.type === "circle") {
      const m = el.querySelector("matrix");
      if (!m) continue;
      const a = Number(m.getAttribute("A0")),
        cx = -Number(m.getAttribute("A4")) / a,
        cy = -Number(m.getAttribute("A5")) / a,
        r = Math.sqrt(cx * cx + cy * cy - Number(m.getAttribute("A2")) / a);
      if (!Number.isFinite(r)) continue;
      const center = project(cx, cy),
        rx = r / v.invXscale,
        ry = r / v.invYscale;
      shapes.push({
        name: o.name,
        kind: "circle",
        points: [],
        center,
        rx,
        ry,
        bounds: {
          left: center.x - rx,
          right: center.x + rx,
          top: center.y - ry,
          bottom: center.y + ry,
        },
      });
      continue;
    } else if (["line", "ray"].includes(o.type)) {
      const c = el.querySelector("coords");
      if (!c) continue;
      const a = Number(c.getAttribute("x")),
        b = Number(c.getAttribute("y")),
        z = Number(c.getAttribute("z"));
      const xmin = v.xMin,
        xmax = xmin + v.width * v.invXscale,
        ymin = v.yMin,
        ymax = ymin + v.height * v.invYscale;
      const candidates: ScreenPoint[] = [];
      for (const x of [xmin, xmax])
        if (Math.abs(b) > 1e-12) {
          const y = -(a * x + z) / b;
          if (y >= ymin && y <= ymax) candidates.push(project(x, y));
        }
      for (const y of [ymin, ymax])
        if (Math.abs(a) > 1e-12) {
          const x = -(b * y + z) / a;
          if (x >= xmin && x <= xmax) candidates.push(project(x, y));
        }
      points = candidates.slice(0, 2);
      if (o.type === "ray" && pointRefs.length >= 2) {
        const start = point(pointRefs[0]),
          toward = point(pointRefs[1]);
        const end = points.find(
          (p) =>
            (p.x - start.x) * (toward.x - start.x) +
              (p.y - start.y) * (toward.y - start.y) >=
            0,
        );
        points = end ? [start, end] : [];
      }
    } else if (o.type === "angle" && pointRefs.length >= 3) {
      const [a, vertex, b] = pointRefs.slice(0, 3).map(point);
      const radius = Number(
        el.querySelector("arcSize")?.getAttribute("val") ?? 30,
      );
      const startAngle = Math.atan2(a.y - vertex.y, a.x - vertex.x);
      const endAngle = Math.atan2(b.y - vertex.y, b.x - vertex.x);
      const value = Math.min(tau, Math.abs(api.getValue(o.name)));
      const sweep =
        Math.abs(positiveAngle(endAngle - startAngle) - value) < 1e-6
          ? value
          : -value;
      points = [
        vertex,
        ...Array.from({ length: 33 }, (_, i) => ({
          x: vertex.x + radius * Math.cos(startAngle + (sweep * i) / 32),
          y: vertex.y + radius * Math.sin(startAngle + (sweep * i) / 32),
        })),
      ];
      shapes.push({
        name: o.name,
        kind: "angle",
        points,
        center: vertex,
        rx: radius,
        startAngle,
        sweep,
        bounds: bounds(points),
      });
      continue;
    }
    if (points.length)
      shapes.push({ name: o.name, points, kind, bounds: bounds(points) });
  }
  return shapes;
}
export function hitObject(shapes: Shape[], p: ScreenPoint) {
  let closestPoint: { name: string; dist: number } | null = null;
  for (const s of shapes) {
    if (s.kind !== "point") continue;
    const dist = Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y);
    if (dist <= 16 && (!closestPoint || dist <= closestPoint.dist)) {
      closestPoint = { name: s.name, dist };
    }
  }
  if (closestPoint) return closestPoint.name;
  // Text and angle decorations sit over paths/polygon fills in the native view.
  for (const s of [...shapes].reverse()) {
    if (
      s.kind === "text" &&
      p.x >= s.bounds.left &&
      p.x <= s.bounds.right &&
      p.y >= s.bounds.top &&
      p.y <= s.bounds.bottom
    )
      return s.name;
    if (
      s.kind === "angle" &&
      s.center &&
      s.sweep !== undefined &&
      s.startAngle !== undefined
    ) {
      const radius = Math.hypot(p.x - s.center.x, p.y - s.center.y);
      const angle = Math.atan2(p.y - s.center.y, p.x - s.center.x);
      const delta = positiveAngle((angle - s.startAngle) * Math.sign(s.sweep));
      if (
        radius > 16 &&
        radius <= s.rx! + 7 &&
        delta <= Math.abs(s.sweep) + 0.12
      )
        return s.name;
    }
  }
  for (const s of [...shapes].reverse()) {
    if (["point", "text", "angle"].includes(s.kind)) continue;
    if (
      s.kind === "circle" &&
      s.center &&
      Math.abs(
        Math.hypot((p.x - s.center.x) / s.rx!, (p.y - s.center.y) / s.ry!) - 1,
      ) *
        Math.min(s.rx!, s.ry!) <
        7
    )
      return s.name;
    for (let i = 1; i < s.points.length; i++)
      if (distance(p, s.points[i - 1], s.points[i]) < 7) return s.name;
    if (
      s.kind === "polygon" &&
      s.points.length > 2 &&
      distance(p, s.points.at(-1)!, s.points[0]) < 7
    )
      return s.name;
  }
  for (const s of [...shapes].reverse()) {
    if (s.kind === "polygon" && pointInPolygon(p, s.points)) return s.name;
  }
  return null;
}
export function containedObjects(shapes: Shape[], box: ScreenBounds) {
  return shapes
    .filter(
      (s) =>
        s.bounds.left >= box.left &&
        s.bounds.right <= box.right &&
        s.bounds.top >= box.top &&
        s.bounds.bottom <= box.bottom,
    )
    .map((s) => s.name);
}
export function selectionBounds(
  controller: GeometryController,
  host: HTMLElement,
) {
  const shapes = screenShapes(controller, host).filter((s) =>
    controller.selectedNames.includes(s.name),
  );
  if (!shapes.length) return null;
  return {
    left: Math.min(...shapes.map((s) => s.bounds.left)),
    top: Math.min(...shapes.map((s) => s.bounds.top)),
    right: Math.max(...shapes.map((s) => s.bounds.right)),
    bottom: Math.max(...shapes.map((s) => s.bounds.bottom)),
  };
}
