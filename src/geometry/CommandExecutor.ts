import { applyObjectLabel } from "./segmentLabels";
import { nativeNumber } from "./nativeNumber";
import { supportsStroke } from "./GeometryState";
import { actionSchema, labelSchema, type GeometryAction, type GeometryCheck } from "../../shared/actions";
import { validateGeometry } from "./GeometryChecks";
import { GeoGebraAdapter } from "./GeoGebraAdapter";
import { bindCircumcircleVertices, circumcircleBoundary, projectOnCircle } from "./CircleBoundary";
import { isPolygonType, POLYGON_TYPES, polygonVertices, triangleVertices } from "./triangleVertices";
const triangleCenters: Record<string, number> = { incenter: 1, centroid: 2, circumcenter: 3, orthocenter: 4 };
const polygonCounts = Array.from({ length: 98 }, (_, i) => i + 3);
const specifications: Record<
  string,
  { command: string; counts: number[]; types?: string[][]; result: string }
> = {
  point_on: { command: "Point", counts: [1], types: [["line", "segment", "ray", "circle", "conic"]], result: "point" },
  segment: {
    command: "Segment",
    counts: [2],
    types: [["point"], ["point"]],
    result: "segment",
  },
  line: {
    command: "Line",
    counts: [2],
    types: [["point"], ["point"]],
    result: "line",
  },
  ray: {
    command: "Ray",
    counts: [2],
    types: [["point"], ["point"]],
    result: "ray",
  },
  polygon: {
    command: "Polygon",
    counts: polygonCounts,
    types: [["point"]],
    result: "polygon",
  },
  regular_polygon: {
    command: "Polygon",
    counts: [2],
    types: [["point"], ["point"]],
    result: "polygon",
  },
  circle: {
    command: "Circle",
    counts: [2],
    types: [["point"], ["point"]],
    result: "circle",
  },
  circle_radius: {
    command: "Circle",
    counts: [1],
    types: [["point"]],
    result: "circle",
  },
  circumcircle: {
    command: "Circle",
    counts: [3],
    types: [["point"], ["point"], ["point"]],
    result: "circle",
  },
  incircle: { command: "Incircle", counts: [3], types: [["point"]], result: "circle" },
  incenter: { command: "TriangleCenter", counts: [3], types: [["point"]], result: "point" },
  circumcenter: { command: "TriangleCenter", counts: [3], types: [["point"]], result: "point" },
  centroid: { command: "TriangleCenter", counts: [3], types: [["point"]], result: "point" },
  orthocenter: { command: "TriangleCenter", counts: [3], types: [["point"]], result: "point" },
  center: { command: "Center", counts: [1], types: [["circle", "conic", "ellipse", "hyperbola"]], result: "point" },
  midpoint: {
    command: "Midpoint",
    counts: [2],
    types: [["point"], ["point"]],
    result: "point",
  },
  intersection: {
    command: "Intersect",
    counts: [2],
    types: [
      ["line", "segment", "ray", "circle", "conic"],
      ["line", "segment", "ray", "circle", "conic"],
    ],
    result: "point",
  },
  perpendicular: {
    command: "PerpendicularLine",
    counts: [2],
    types: [["point"], ["line", "segment", "ray"]],
    result: "line",
  },
  parallel: {
    command: "Line",
    counts: [2],
    types: [["point"], ["line", "segment", "ray"]],
    result: "line",
  },
  perpendicular_bisector: {
    command: "PerpendicularBisector",
    counts: [2],
    types: [["point"], ["point"]],
    result: "line",
  },
  angle_bisector: {
    command: "AngleBisector",
    counts: [3],
    types: [["point"]],
    result: "line",
  },
  angle: { command: "Angle", counts: [3], types: [["point"]], result: "angle" },
  distance: {
    command: "Distance",
    counts: [2],
    types: [["point"]],
    result: "numeric",
  },
  length: {
    command: "Length",
    counts: [1],
    types: [["segment", "vector", "circle", "conic"]],
    result: "numeric",
  },
  area: {
    command: "Area",
    counts: [1],
    types: [[...POLYGON_TYPES, "circle", "conic"]],
    result: "numeric",
  },
  reflect: { command: "Reflect", counts: [2], result: "unknown" },
  translate: { command: "Translate", counts: [2], result: "unknown" },
  rotate: { command: "Rotate", counts: [2], result: "unknown" },
  dilate: { command: "Dilate", counts: [2], result: "unknown" },
  vector: {
    command: "Vector",
    counts: [2],
    types: [["point"]],
    result: "vector",
  },
};

function segmentEndpoints(api: GeoGebraAdapter["api"], name: string): [string, string] | null {
  if (api.getObjectType(name) !== "segment") return null;
  const match = api.getCommandString(name, false).match(/^Segment[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)/);
  if (!match) return null;
  const [u, v] = [match[1], match[2]];
  if (!api.exists(u) || !api.exists(v) || api.getObjectType(u) !== "point" || api.getObjectType(v) !== "point") return null;
  return [u, v];
}

function synthesizePolygonsFromSegments(
  adapter: GeoGebraAdapter,
  initialNames: Set<string>,
  roles: Map<string, boolean>,
) {
  const api = adapter.api;
  const adj = new Map<string, Set<string>>();
  for (const name of api.getAllObjectNames("segment")) {
    if (initialNames.has(name) || roles.get(name) === true) continue;
    const ends = segmentEndpoints(api, name);
    if (!ends) continue;
    const [u, v] = ends;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  }
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [node, neighbors] of [...adj.entries()]) {
      if (neighbors.size < 2) {
        for (const nb of neighbors) adj.get(nb)?.delete(node);
        adj.delete(node);
        pruned = true;
      }
    }
  }
  if (adj.size < 3) return;
  const existingPolygons = api
    .getAllObjectNames()
    .filter((name) => isPolygonType(api.getObjectType(name)))
    .map((name) => {
      try {
        return new Set(polygonVertices(api, name));
      } catch {
        return new Set<string>();
      }
    });
  const visited = new Set<string>();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const comp: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const curr = queue.shift()!;
      comp.push(curr);
      for (const nb of adj.get(curr) ?? []) {
        if (!visited.has(nb) && adj.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    if (comp.length < 3 || comp.length > 13) continue;
    let candidates = comp;
    if (comp.length >= 4) {
      const hub = comp.find((u) => (adj.get(u)?.size ?? 0) === comp.length - 1);
      if (hub && comp.filter((u) => u !== hub).every((u) => (adj.get(u)?.size ?? 0) === 3)) {
        candidates = comp.filter((u) => u !== hub);
      }
    }
    let cycle: string[] = [];
    if (candidates.every((u) => {
      const deg = [...(adj.get(u) ?? [])].filter((v) => candidates.includes(v)).length;
      return deg === 2;
    })) {
      const set = new Set(candidates);
      const ordered = [candidates[0]];
      const seen = new Set([candidates[0]]);
      while (ordered.length < candidates.length) {
        const last = ordered.at(-1)!;
        const next = [...(adj.get(last) ?? [])].find((v) => set.has(v) && !seen.has(v));
        if (!next) break;
        ordered.push(next);
        seen.add(next);
      }
      if (ordered.length === candidates.length && adj.get(ordered.at(-1)!)?.has(ordered[0])) {
        cycle = ordered;
      }
    } else if (candidates.length >= 3 && candidates.length <= 12) {
      const cx = candidates.reduce((s, u) => s + api.getXcoord(u), 0) / candidates.length;
      const cy = candidates.reduce((s, u) => s + api.getYcoord(u), 0) / candidates.length;
      const sorted = [...candidates].sort(
        (u, v) => Math.atan2(api.getYcoord(u) - cy, api.getXcoord(u) - cx) - Math.atan2(api.getYcoord(v) - cy, api.getXcoord(v) - cx),
      );
      if (sorted.every((u, i) => adj.get(u)?.has(sorted[(i + 1) % sorted.length]))) {
        cycle = sorted;
      }
    }
    if (cycle.length < 3 || cycle.length > 12) continue;
    const hasPolygon = existingPolygons.some(
      (polySet) => polySet.size === cycle.length && cycle.every((v) => polySet.has(v)),
    );
    if (hasPolygon) continue;
    const joined = cycle.join("");
    let polyLabel = labelSchema.safeParse(joined).success && !api.exists(joined) ? joined : "";
    if (!polyLabel) {
      let idx = 1;
      while (api.exists(`poly${idx}`)) idx++;
      polyLabel = `poly${idx}`;
    }
    const beforePoly = new Set(api.getAllObjectNames());
    adapter.command(`${polyLabel}=Polygon(${cycle.join(",")})`);
    roles.set(polyLabel, false);
    adapter.color(polyLabel, "#C9E1E6");
    api.setFilling(polyLabel, 0.18);
    api.setLineThickness(polyLabel, 2);
    api.setLabelVisible(polyLabel, false);
    for (const created of api.getAllObjectNames()) {
      if (!beforePoly.has(created) && created !== polyLabel) {
        roles.set(created, true);
        api.setLabelVisible(created, false);
      }
    }
    existingPolygons.push(new Set(cycle));
  }
}

export function executeActions(
  adapter: GeoGebraAdapter,
  actions: GeometryAction[],
  checks: GeometryCheck[] = [],
) {
  if (actions.length > 32) throw new Error("Tối đa 32 thao tác mỗi lần.");
  const api = adapter.api;
  const before = adapter.snapshot();
  const initialNames = new Set(api.getAllObjectNames());
  const roles = new Map<string, boolean>(), visibility = new Map<string, boolean>();
  const need = (name: string, types?: string[]) => {
    if (!api.exists(name)) throw new Error(`Không tìm thấy đối tượng ${name}.`);
    if (types && !types.includes(api.getObjectType(name)))
      throw new Error(`Đối tượng ${name} không phù hợp với phép dựng.`);
  };
  const unique = (name: string) => {
    if (api.exists(name))
      throw new Error(`Tên ${name} đã tồn tại. Hãy chọn tên khác.`);
  };
  try {
    for (const input of actions) {
      const a = actionSchema.parse(input);
      if (a.type === "history")
        throw new Error("Thao tác lịch sử phải được thực hiện qua bộ điều khiển tài liệu.");
      const prior = new Set(api.getAllObjectNames());
      if (a.type === "view") {
        adapter.setCoordinateAxes(a.axes);
        if (a.grid !== undefined) api.setGridVisible(a.grid);
      }
      if (a.type === "point") {
        unique(a.label);
        adapter.command(`${a.label}=(${nativeNumber(a.x)},${nativeNumber(a.y)})`);
      }
      if (a.type === "construct") {
        unique(a.label);
        // Resolve documented Circle overloads against engine-owned types.
        // A triangle reference means its actual vertices, never guessed names.
        if (
          (["circle", "circumcircle", "incircle", ...Object.keys(triangleCenters)].includes(a.kind)) &&
          a.refs.length === 1 &&
          api.exists(a.refs[0]) &&
          isPolygonType(api.getObjectType(a.refs[0]))
        ) {
          a.refs = triangleVertices(api, a.refs[0]);
          if (a.kind === "circle") a.kind = "circumcircle";
        }
        if (a.kind === "circle" && a.refs.length === 3) a.kind = "circumcircle";
        if (a.kind === "circle" && a.refs.length === 1 && a.value !== undefined)
          a.kind = "circle_radius";
        if (a.kind === "point_on" && a.value !== undefined) throw new Error("Dùng position để khởi tạo điểm kéo được trên quỹ tích.");
        if (a.position && a.kind !== "point_on") throw new Error("Vị trí ban đầu chỉ dùng cho điểm trên quỹ tích.");
        const spec = specifications[a.kind];
        if (!spec.counts.includes(a.refs.length))
          throw new Error("Số đối tượng tham chiếu không đúng.");
        a.refs.forEach((r, i) =>
          need(r, spec.types?.[Math.min(i, spec.types.length - 1)]),
        );
        if (["circumcircle", "incircle", "angle_bisector", ...Object.keys(triangleCenters)].includes(a.kind)) {
          const [p, q, r] = a.refs.map((name) => [
            api.getXcoord(name),
            api.getYcoord(name),
          ]);
          const determinant =
            (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
          if (Math.abs(determinant) < 1e-10)
            throw new Error(
              "Ba điểm trùng nhau hoặc thẳng hàng, không thể thực hiện phép dựng này.",
            );
        }
        if (
          [
            "segment",
            "line",
            "ray",
            "circle",
            "regular_polygon",
            "vector",
          ].includes(a.kind) &&
          a.refs.length === 2
        ) {
          const [p, q] = a.refs;
          if (
            Math.hypot(
              api.getXcoord(p) - api.getXcoord(q),
              api.getYcoord(p) - api.getYcoord(q),
            ) < 1e-10
          )
            throw new Error("Cần hai điểm phân biệt.");
        }
        let refs = [...a.refs];
        if (a.kind === "intersection") {
          const multiple = a.refs.some((name) => ["circle", "conic"].includes(api.getObjectType(name)));
          if (a.value !== undefined || multiple) {
            const index = a.value ?? 1;
            if (!Number.isInteger(index) || index < 1 || index > 4) throw new Error("Chỉ số giao điểm phải là số nguyên từ 1 đến 4.");
            refs.push(String(index));
          }
        }
        if (a.kind in triangleCenters) refs.push(String(triangleCenters[a.kind]));
        if (
          ["regular_polygon", "circle_radius", "rotate", "dilate"].includes(
            a.kind,
          )
        ) {
          if (a.value === undefined)
            throw new Error("Thiếu giá trị cho phép dựng.");
          if (
            a.kind === "regular_polygon" &&
            (!Number.isInteger(a.value) || a.value < 3 || a.value > 100)
          )
            throw new Error("Số đỉnh phải từ 3 đến 100.");
          if (a.kind === "circle_radius" && a.value <= 0)
            throw new Error("Bán kính phải lớn hơn 0.");
          let scaleValue = a.value;
          if (a.kind === "dilate" && a.refs.every((r) => api.getObjectType(r) === "point")) {
            const r0 = Math.hypot(api.getXcoord(a.refs[0]) - api.getXcoord(a.refs[1]), api.getYcoord(a.refs[0]) - api.getYcoord(a.refs[1]));
            const distCheck = checks.find((c) => c.kind === "distance" && ((c.refs[0] === a.label && c.refs[1] === a.refs[1]) || (c.refs[1] === a.label && c.refs[0] === a.refs[1])));
            if (r0 > 1e-9 && distCheck && distCheck.kind === "distance" && Math.abs(a.value - distCheck.value / r0) < 1e-4) scaleValue = distCheck.value / r0;
          }
          refs =
            a.kind === "rotate" || a.kind === "dilate"
              ? [
                  refs[0],
                  nativeNumber(scaleValue) + (a.kind === "rotate" ? "°" : ""),
                  refs[1],
                ]
              : [...refs, nativeNumber(scaleValue)];
        }
        if (a.kind === "angle" && refs.length === 3) {
          const [p, v, q] = refs.map((name) => [api.getXcoord(name), api.getYcoord(name)]);
          if ((p[0] - v[0]) * (q[1] - v[1]) - (p[1] - v[1]) * (q[0] - v[0]) < 0) refs = [refs[2], refs[1], refs[0]];
        }
        if (a.kind === "reflect")
          need(a.refs[1], ["point", "line", "segment", "ray", "circle"]);
        if (a.kind === "translate") need(a.refs[1], ["vector"]);
        if (a.kind === "rotate" || a.kind === "dilate")
          need(a.refs[1], ["point"]);
        // Polygon creates its boundary segments automatically. Give a new
        // boundary the requested name instead of drawing a second copy of it.
        const boundary =
          a.kind === "segment"
            ? api.getAllObjectNames().find((name) => {
                if (
                  initialNames.has(name) ||
                  api.getObjectType(name) !== "segment"
                )
                  return false;
                const inputs = api
                  .getCommandString(name, false)
                  .match(
                    /^Segment[\[(]([A-Za-z][A-Za-z0-9_]*'*),\s*([A-Za-z][A-Za-z0-9_]*'*),\s*([A-Za-z][A-Za-z0-9_]*'*)[\])]$/,
                  );
                return (
                  inputs &&
                  ((inputs[1] === refs[0] && inputs[2] === refs[1]) ||
                    (inputs[1] === refs[1] && inputs[2] === refs[0]))
                );
              })
            : undefined;
        if (boundary) {
          // Naming a requested polygon edge must preserve its primary role.
          const inheritedRole = roles.get(boundary) ?? false;
          roles.delete(boundary);
          roles.set(a.label, inheritedRole && (a.auxiliary ?? true));
          if (!api.renameObject(boundary, a.label))
            throw new Error("Không thể đặt tên cạnh đa giác.");
        } else adapter.command(`${a.label}=${spec.command}(${refs.join(",")})`);
        // Point(path, parameter) fixes its parameter; initialize a movable path point instead.
        if (a.kind === "point_on" && a.position) api.setCoords(a.label, a.position.x, a.position.y);
        if (a.kind === "length" && !a.auxiliary && api.getObjectType(a.refs[0]) === "segment") {
          roles.set(a.refs[0], false);
          visibility.set(a.refs[0], true);
          applyObjectLabel(api, a.refs[0], "name_value");
        }
      }
      if (a.type === "altitude") {
        need(a.vertex, ["point"]);
        need(a.base, ["segment", "line", "ray"]);
        unique(a.foot);
        unique(a.label);
        if (a.foot === a.label)
          throw new Error("Tên chân đường cao và đoạn thẳng phải khác nhau.");
        adapter.command(
          `${a.foot}=Intersect(${a.base},PerpendicularLine(${a.vertex},${a.base}))`,
        );
        adapter.command(`${a.label}=Segment(${a.vertex},${a.foot})`);
        if (api.getValue(a.label) < 1e-10)
          throw new Error(
            "Đỉnh đã nằm trên đường đáy, đường cao có độ dài bằng 0.",
          );
        adapter.color(a.foot, "#4F18E9");
        adapter.color(a.label, "#4F18E9");
      }
      if (a.type === "style") {
        need(a.target);
        if (a.color) adapter.color(a.target, a.color);
        if (a.label) applyObjectLabel(api, a.target, a.label);
        if (a.visible !== undefined) api.setVisible(a.target, a.visible);
        if (a.thickness) {
          if (!supportsStroke(api.getObjectType(a.target)))
            throw new Error(
              "Đối tượng này không hỗ trợ độ dày nét. Bạn có thể đổi màu hoặc hiển thị.",
            );
          api.setLineThickness(a.target, a.thickness);
        }
      }
      if (a.type === "move") {
        need(a.target, ["point"]);
        if (!api.isMoveable(a.target))
          throw new Error("Điểm này phụ thuộc phép dựng hoặc đã khóa. Hãy chỉnh điểm điều khiển của nó.");
        const boundary = circumcircleBoundary(api, a.target);
        if (boundary) {
          if (!boundary.vertices.every(name => api.isIndependent(name)))
            throw new Error("Đỉnh thuộc hình có ràng buộc. Kéo đỉnh để xoay hình quanh tâm và giữ nguyên đường tròn.");
          const position = projectOnCircle(boundary, a.x, a.y);
          if (!position) throw new Error("Cần chọn hướng khác tâm đường tròn để trượt đỉnh.");
          bindCircumcircleVertices(api, boundary);
          api.setCoords(a.target, position.x, position.y);
        } else api.setCoords(a.target, a.x, a.y);
      }
      if (a.type === "delete") {
        need(a.target);
        api.deleteObject(a.target);
      }
      for (const name of api.getAllObjectNames()) {
        if (!api.isDefined(name))
          throw new Error(
            `Phép dựng làm ${name} không xác định. Kiểm tra các điểm trùng nhau, thẳng hàng hoặc điều kiện mâu thuẫn.`,
          );
        if (!prior.has(name)) {
          if ((a.type === "point" || a.type === "construct") && a.auxiliary !== undefined && !roles.has(name)) roles.set(name, a.auxiliary);
          const type = api.getObjectType(name);
          if (type === "segment") applyObjectLabel(api, name, "name");
          if (type === "angle") api.setLabelStyle(name,0);
          api.setLabelVisible(name, type === "point");
          api.setLineThickness(name, 2);
          if (isPolygonType(type)) {
            adapter.color(name, "#C9E1E6");
            api.setFilling(name, 0.18);
          } else if (a.type !== "altitude") adapter.color(name, "#23232D");
          if (type === "point") api.setPointSize(name, 4);
        }
      }
      if (a.type === "style" && a.visible !== undefined) visibility.set(a.target, a.visible);
    }
    synthesizePolygonsFromSegments(adapter, initialNames, roles);
    for (const [name, auxiliary] of roles) if (api.exists(name)) {
      api.setAuxiliary(name, auxiliary);
      if (auxiliary && visibility.get(name) !== true) api.setVisible(name, false);
    }
    adapter.ensureBisectorMarks();
    adapter.formatSegmentLabels();
    adapter.formatPointLabels();
    adapter.hideDuplicateBoundaryLabels(api.getAllObjectNames().filter((name) => !initialNames.has(name)));
    validateGeometry(adapter, checks);
  } catch (error) {
    adapter.restore(before);
    throw error;
  }
}
