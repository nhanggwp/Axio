import type { GeometryAction } from "../../shared/actions";
import { geometryNames } from "../../shared/geometryNames";
import {
  hiddenSolidEdges,
  solidKinds,
  solidNames,
  solidTopology,
  solidVertexPositions,
  type SolidKind,
  type SolidDimensions,
} from "../../shared/solids";
import type { GGBApi } from "../types/geogebra";
import { nativeNumber } from "./nativeNumber";

type SolidAction = Extract<GeometryAction, { type: "solid" }>;
export type SolidRecord = {
  name: string;
  kind: SolidKind;
  dimensions: SolidDimensions;
  visible: boolean;
  vertices: string[];
  faces: string[];
  edges: string[];
};
const prefix = "axio-solid:";
const modeMarker = "axio:space-mode:v1";
export function isSpaceModeObject(api: GGBApi, name: string) {
  return (
    api.getObjectType(name) === "boolean" &&
    api.getCaption(name, false) === modeMarker
  );
}
export function spaceModeEnabled(api: GGBApi) {
  const name = api
    .getAllObjectNames("boolean")
    .find((name) => api.getCaption(name, false) === modeMarker);
  return !!name && api.getValue(name) === 1;
}
export function setSpaceMode(api: GGBApi, enabled: boolean) {
  let name = api
    .getAllObjectNames("boolean")
    .find((name) => api.getCaption(name, false) === modeMarker);
  if (!name) {
    name = "AxioSpaceMode";
    let i = 1;
    while (api.exists(name)) name = `AxioSpaceMode${i++}`;
  }
  if (!api.evalCommand(`${name}=${enabled ? "true" : "false"}`))
    throw new Error("Chưa thể đổi chế độ hình không gian.");
  api.setCaption(name, modeMarker);
  api.setAuxiliary(name, true);
  api.setVisible(name, false);
  api.setLabelVisible(name, false);
  refreshSolidEdges(api);
}
const cache = new WeakMap<
  GGBApi,
  Map<string, { key: string; record: SolidRecord }>
>();
export function solidRecords(api: GGBApi): SolidRecord[] {
  let cached = cache.get(api);
  if (!cached) {
    cached = new Map();
    cache.set(api, cached);
  }
  return api.getAllObjectNames("list").flatMap((name) => {
    const caption = api.getCaption(name, false);
    if (!caption.startsWith(prefix) || caption.length > 500) return [];
    const command = api.getCommandString(name, false),
      key = caption + command;
    const old = cached!.get(name);
    if (old?.key === key) return [old.record];
    try {
      const meta = JSON.parse(caption.slice(prefix.length));
      if (
        meta.version !== 1 ||
        !solidKinds.includes(meta.kind) ||
        ![
          meta.dimensions?.width,
          meta.dimensions?.depth,
          meta.dimensions?.height,
        ].every(
          (v) =>
            typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10000,
        )
      )
        return [];
      const n = solidTopology(meta.kind).base.length,
        refs = geometryNames(command);
      if (refs.length !== 6 * n + 2 || !refs.every((ref) => api.exists(ref)))
        return [];
      const record: SolidRecord = {
        name,
        kind: meta.kind,
        dimensions: meta.dimensions,
        visible: meta.visible !== false,
        vertices: refs.slice(0, 2 * n),
        faces: refs.slice(2 * n, 3 * n + 2),
        edges: refs.slice(3 * n + 2),
      };
      if (
        !record.vertices.every((ref) => api.getObjectType(ref) === "point") ||
        !record.edges.every((ref) => api.getObjectType(ref) === "segment")
      )
        return [];
      cached!.set(name, { key, record });
      return [record];
    } catch {
      return [];
    }
  });
}
export function solidHiddenEdges(api: GGBApi, solid: SolidRecord): string[] {
  const topology = solidTopology(solid.kind),
    points = solid.vertices.map((name) => ({
      x: api.getXcoord(name),
      y: api.getYcoord(name),
    }));
  const hidden = hiddenSolidEdges(points, topology.faces, topology.edges);
  return solid.edges.filter((_, i) => hidden[i]);
}
export function refreshSolidEdges(api: GGBApi) {
  const enabled = spaceModeEnabled(api);
  for (const solid of solidRecords(api)) {
    const hidden = new Set(enabled ? solidHiddenEdges(api, solid) : []);
    for (const name of solid.edges) {
      const style = hidden.has(name) ? 1 : 0;
      if (api.getLineStyle(name) !== style) api.setLineStyle(name, style);
    }
  }
}
export function allocateSolidVertices(api: GGBApi, count: number): string[] {
  const n = count / 2;
  for (let suffix = 0; ; suffix++) {
    const base = "ABCD"
      .slice(0, n)
      .split("")
      .map((letter) => letter + (suffix ? `_${suffix}` : ""));
    const vertices = [...base, ...base.map((name) => name + "'")];
    if (vertices.every((name) => !api.exists(name))) return vertices;
  }
}
function saveMeta(
  api: GGBApi,
  solid: Pick<SolidRecord, "name" | "kind" | "dimensions" | "visible">,
) {
  api.setCaption(
    solid.name,
    prefix +
      JSON.stringify({
        version: 1,
        kind: solid.kind,
        dimensions: solid.dimensions,
        visible: solid.visible,
      }),
  );
}
export function createSolid(api: GGBApi, action: SolidAction): SolidRecord {
  const topology = solidTopology(action.kind),
    n = topology.base.length;
  const dimensions =
    action.dimensions ??
    (action.kind === "cube"
      ? { width: 3, depth: 3, height: 3 }
      : { width: 4, depth: 3, height: 3 });
  if (
    action.kind === "cube" &&
    (Math.abs(dimensions.width - dimensions.depth) > 1e-8 ||
      Math.abs(dimensions.width - dimensions.height) > 1e-8)
  )
    throw new Error(
      "Hình lập phương cần chiều dài, chiều rộng và chiều cao bằng nhau.",
    );
  const vertices = action.vertices ?? allocateSolidVertices(api, 2 * n);
  if (
    vertices.length !== 2 * n ||
    new Set([action.label, ...vertices]).size !== vertices.length + 1 ||
    [action.label, ...vertices].some((name) => api.exists(name))
  )
    throw new Error(
      `Cần ${2 * n} tên đỉnh khác nhau, chưa có trên hình, và tên khối riêng.`,
    );
  const reserved = new Set([action.label, ...vertices]);
  const allocate = (suffix: string) => {
    const stem = action.label.slice(0, 15) + suffix;
    let name = stem,
      i = 1;
    while (api.exists(name) || reserved.has(name)) name = stem + `_${i++}`;
    reserved.add(name);
    return name;
  };
  const faces = topology.faces.map((_, i) => allocate(`_f${i + 1}`)),
    edges = topology.edges.map((_, i) => allocate(`_e${i + 1}`));
  const origin = action.origin ?? { x: 0, y: 0 },
    scale = action.scale ?? 1,
    depthX = action.view === "left" ? -0.55 : 0.55;
  const positions = solidVertexPositions(action.kind, dimensions);
  const command = (text: string) => {
    if (!api.evalCommand(text))
      throw new Error("Không thể dựng hình biểu diễn: " + text);
  };
  const free = [0, 1, n - 1, n];
  for (const i of free) {
    const p = positions[i];
    command(
      `${vertices[i]}=(${nativeNumber(origin.x + scale * (p.x + depthX * p.y))},${nativeNumber(origin.y + scale * (p.z + 0.35 * p.y))})`,
    );
  }
  const a = vertices[0],
    b = vertices[1],
    d = vertices[n - 1],
    top = vertices[n];
  for (let i = 2; i < n - 1; i++) {
    const p = topology.base[i],
      last = topology.base[n - 1],
      v = p.y / last.y,
      u = p.x - v * last.x;
    command(
      `${vertices[i]}=${a}+${nativeNumber(u)}*(${b}-${a})+${nativeNumber(v)}*(${d}-${a})`,
    );
  }
  for (let i = 1; i < n; i++)
    command(`${vertices[n + i]}=${vertices[i]}+(${top}-${a})`);
  for (let i = 0; i < faces.length; i++)
    command(
      `${faces[i]}=Polygon({${topology.faces[i].map((v) => vertices[v]).join(",")}})`,
    );
  for (let i = 0; i < edges.length; i++)
    command(
      `${edges[i]}=Segment(${topology.edges[i].map((v) => vertices[v]).join(",")})`,
    );
  command(`${action.label}={${[...vertices, ...faces, ...edges].join(",")}}`);
  const record: SolidRecord = {
    name: action.label,
    kind: action.kind,
    dimensions,
    visible: true,
    vertices,
    faces,
    edges,
  };
  setSpaceMode(api, true);
  saveMeta(api, record);
  api.setVisible(action.label, false);
  api.setLabelVisible(action.label, false);
  for (const name of vertices) {
    api.setVisible(name, true);
    api.setAuxiliary(name, false);
    api.setPointSize(name, 3);
    api.setColor(name, 35, 35, 45);
    api.setLayer(name, 2);
    api.setLabelStyle(name, 0);
    api.setLabelVisible(name, true);
  }
  for (const name of faces) {
    api.setVisible(name, true);
    api.setAuxiliary(name, false);
    api.setColor(name, 9, 239, 248);
    api.setLineThickness(name, 0);
    api.setFilling(name, 0);
    api.setLayer(name, 0);
    api.setLabelVisible(name, false);
  }
  for (const name of edges) {
    api.setVisible(name, true);
    api.setAuxiliary(name, false);
    api.setColor(name, 35, 35, 45);
    api.setLineThickness(name, 2);
    api.setLayer(name, 1);
    api.setLabelVisible(name, false);
  }
  refreshSolidEdges(api);
  if (action.showDimensions)
    for (const i of [0, n - 1, 2 * n]) {
      const name = edges[i],
        [p, q] = topology.edges[i].map((index) => positions[index]);
      const value = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      api.setCaption(
        name,
        `${topology.edges[i].map((v) => vertices[v]).join("")} = ${Number(value.toFixed(2))}`,
      );
      api.setLabelStyle(name, 3);
      api.setLabelVisible(name, true);
    }
  return record;
}
export function solidMember(api: GGBApi, name: string) {
  return solidRecords(api).find(
    (solid) =>
      solid.name === name ||
      [...solid.vertices, ...solid.edges, ...solid.faces].includes(name),
  );
}
export function solidEdgeLength(
  solid: SolidRecord,
  name: string,
): number | undefined {
  const index = solid.edges.indexOf(name);
  if (index < 0) return;
  const positions = solidVertexPositions(solid.kind, solid.dimensions),
    [p, q] = solidTopology(solid.kind).edges[index].map((i) => positions[i]);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}
export function setSolidVisible(
  api: GGBApi,
  solid: SolidRecord,
  visible: boolean,
) {
  saveMeta(api, { ...solid, visible });
  for (const name of [...solid.vertices, ...solid.faces, ...solid.edges])
    api.setVisible(name, visible);
}
export function deleteSolid(api: GGBApi, solid: SolidRecord) {
  for (const name of [
    ...solid.vertices,
    ...solid.faces,
    ...solid.edges,
    solid.name,
  ])
    if (api.exists(name)) api.deleteObject(name);
}
export function solidDescription(solid: SolidRecord) {
  return `${solidNames[solid.kind]} · ${solid.faces.length} mặt · ${solid.vertices.length} đỉnh · ${solid.edges.length} cạnh`;
}
