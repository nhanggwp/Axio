import type { GeometryController } from "./GeometryController";
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
  kind: "point" | "path" | "polygon" | "circle";
  center?: ScreenPoint;
  rx?: number;
  ry?: number;
};
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
  const shapes: Shape[] = [];
  for (const o of controller.objects) {
    if (!o.visible || !api.isDefined(o.name)) continue;
    const el = elements.get(o.name);
    if (!el) continue;
    const refs = (o.definition.match(/[\p{L}][\p{L}\p{N}_]*/gu) ?? [])
      .slice(1)
      .filter((n) => api.exists(n));
    const pointRefs = refs.filter((n) => api.getObjectType(n) === "point");
    let points: ScreenPoint[] = [];
    let kind: Shape["kind"] = "path";
    if (o.type === "point") {
      points = [point(o.name)];
      kind = "point";
    } else if (["segment", "vector"].includes(o.type) && pointRefs.length >= 2)
      points = pointRefs.slice(0, 2).map(point);
    else if (
      ["polygon", "triangle", "quadrilateral", "pentagon", "hexagon"].includes(
        o.type,
      )
    ) {
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
      points = [point(pointRefs[1])];
      kind = "point";
    }
    if (points.length)
      shapes.push({ name: o.name, points, kind, bounds: bounds(points) });
  }
  return shapes;
}
export function hitObject(shapes: Shape[], p: ScreenPoint) {
  const points = shapes.filter((s) => s.kind === "point");
  for (const s of [...points, ...shapes.filter((s) => s.kind !== "point")]
    .reverse()
    .sort((a, b) => Number(b.kind === "point") - Number(a.kind === "point"))) {
    if (
      s.kind === "point" &&
      Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= 10
    )
      return s.name;
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
