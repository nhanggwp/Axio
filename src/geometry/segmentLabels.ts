import { geometryNames } from "../../shared/geometryNames";
import type { GGBApi } from "../types/geogebra";
import type { GeometryObject } from "../../shared/actions";
import { isPolygonType, polygonVertices } from "./triangleVertices";

const BOUNDARY_SEGMENT_RE =
  /^(?:Segment|ĐoạnThẳng)[\[(]\s*[^,\s]+\s*,\s*[^,\]\)\s]+\s*,/i;

export function isDuplicateBoundarySegment(
  o: GeometryObject,
  allObjects: readonly GeometryObject[],
): boolean {
  if (
    o.type !== "segment" ||
    !o.displayName ||
    !BOUNDARY_SEGMENT_RE.test(o.definition)
  ) {
    return false;
  }
  return allObjects.some(
    (other) =>
      other.name !== o.name &&
      other.type === "segment" &&
      other.displayName === o.displayName &&
      !BOUNDARY_SEGMENT_RE.test(other.definition),
  );
}

/** Display the actual endpoints or polygon vertices; object IDs remain stable for dependencies and AI. */
export function segmentDisplayName(
  api: GGBApi,
  name: string,
): string | undefined {
  const type = api.getObjectType(name);
  if (isPolygonType(type)) {
    try {
      const vertices = polygonVertices(api, name);
      if (vertices.length >= 3) return vertices.join("");
    } catch {
      return undefined;
    }
  }
  if (type !== "segment") return;
  const match = api
    .getCommandString(name, false)
    .match(/^Segment[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)/);
  if (!match) return;
  const endpoints = match.slice(1, 3);
  if (
    !endpoints.every(
      (point) => api.exists(point) && api.getObjectType(point) === "point",
    )
  )
    return;
  return endpoints.sort().join("");
}

export function formatSegmentLabels(
  api: GGBApi,
  names = api.getAllObjectNames("segment"),
) {
  for (const name of names) {
    if (api.getObjectType(name) !== "segment") continue;
    const display = segmentDisplayName(api, name);
    if (!display) continue;
    const mode = api.getLabelStyle(name);
    const previous = api.getCaption(name, false);
    const caption =
      mode === 2 || previous === "%v"
        ? "%v"
        : mode === 1 || previous.endsWith(" = %v")
          ? `${display} = %v`
          : display;
    if (api.getCaption(name, false) !== caption) api.setCaption(name, caption);
    if (api.getLabelStyle(name) !== 3) api.setLabelStyle(name, 3);
  }
}

export type ObjectLabel = "name" | "value" | "name_value" | "hidden";
export function applyObjectLabel(
  api: GGBApi,
  name: string,
  label: ObjectLabel,
) {
  if (label === "hidden") {
    api.setLabelVisible(name, false);
    return;
  }
  const type = api.getObjectType(name);
  if (type === "segment") {
    const display = segmentDisplayName(api, name) ?? name;
    api.setCaption(
      name,
      label === "value"
        ? "%v"
        : label === "name_value"
          ? `${display} = %v`
          : display,
    );
    api.setLabelStyle(name, 3);
  } else if (type === "point") {
    // A caption preserves an explicit choice when coordinate mode is toggled.
    api.setCaption(
      name,
      label === "value" ? "%v" : label === "name_value" ? "%n = %v" : "%n",
    );
    api.setLabelStyle(name, 3);
  } else
    api.setLabelStyle(
      name,
      label === "value" ? 2 : label === "name_value" ? 1 : 0,
    );
  api.setLabelVisible(name, true);
}
export function isMeasurementObject(api: GGBApi, name: string): boolean {
  const type = api.getObjectType(name);
  if (type === "segment" || type === "angle") return true;
  if (type !== "text") return false;
  const visited = new Set<string>();
  const visit = (target: string): boolean => {
    if (visited.has(target) || visited.size >= 64 || !api.exists(target))
      return false;
    visited.add(target);
    const definition = api
      .getCommandString(target, false)
      .replace(/"(?:[^"\\]|\\.)*"/g, "");
    if (/\b(?:Distance|Length|Area|Radius|Angle)[\[(]/.test(definition))
      return true;
    return geometryNames(definition).some(
      (ref) => ref !== target && visit(ref),
    );
  };
  return visit(name);
}
export function hasMeasurementIntent(api: GGBApi, name: string) {
  const type = api.getObjectType(name);
  return type === "text"
    ? isMeasurementObject(api, name)
    : type === "segment"
      ? api.getCaption(name, false).includes("%v") ||
        [1, 2].includes(api.getLabelStyle(name))
      : type === "angle" && [1, 2].includes(api.getLabelStyle(name));
}
export function measurementVisible(api: GGBApi, name: string) {
  const type = api.getObjectType(name);
  if (type === "text")
    return isMeasurementObject(api, name) && api.getVisible(name);
  return (
    api.getVisible(name) &&
    /<show[^>]*label="true"/.test(api.getXML(name)) &&
    ((type === "segment" && api.getCaption(name, false).includes("%v")) ||
      (type === "angle" && [1, 2].includes(api.getLabelStyle(name))))
  );
}
export function setMeasurementVisible(
  api: GGBApi,
  name: string,
  show: boolean,
) {
  if (api.getObjectType(name) === "text") {
    api.setVisible(name, show);
    return;
  }
  if (!show) {
    api.setLabelVisible(name, false);
    return;
  }
  applyObjectLabel(
    api,
    name,
    api.getObjectType(name) === "segment" ? "name_value" : "value",
  );
}

/** Keep polygon-owned edges for dependencies, but do not print a second caption. */
export function hideDuplicateBoundaryLabels(
  api: GGBApi,
  names = api.getAllObjectNames("segment"),
) {
  const groups = new Map<string, { name: string; boundary: boolean }[]>();
  for (const name of api.getAllObjectNames("segment")) {
    const match = api
      .getCommandString(name, false)
      .match(/^Segment[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)(\s*,)?/);
    if (!match) continue;
    const key = JSON.stringify(match.slice(1, 3).sort());
    const group = groups.get(key) ?? [];
    group.push({ name, boundary: !!match[3] });
    groups.set(key, group);
  }
  const targets = new Set(names);
  for (const group of groups.values()) {
    const primary = group.find((item) => !item.boundary) ?? group[0];
    for (const item of group) {
      if (item !== primary && item.boundary && targets.has(item.name)) {
        api.setLabelVisible(item.name, false);
      }
    }
  }
}
