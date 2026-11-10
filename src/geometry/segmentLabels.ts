import type { GGBApi } from "../types/geogebra";
import { isPolygonType, polygonVertices } from "./triangleVertices";

/** Display the actual endpoints or polygon vertices; object IDs remain stable for dependencies and AI. */
export function segmentDisplayName(api: GGBApi, name: string): string | undefined {
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
  const match = api.getCommandString(name, false).match(/^Segment[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)/);
  if (!match) return;
  const endpoints = match.slice(1, 3);
  if (!endpoints.every((point) => api.exists(point) && api.getObjectType(point) === "point")) return;
  return endpoints.sort().join("");
}

export function formatSegmentLabels(api: GGBApi, names = api.getAllObjectNames("segment")) {
  for (const name of names) {
    if (api.getObjectType(name) !== "segment") continue;
    const display = segmentDisplayName(api, name);
    if (!display) continue;
    const caption = `${display} = %v`;
    if (api.getCaption(name, false) !== caption) api.setCaption(name, caption);
    if (api.getLabelStyle(name) !== 3) api.setLabelStyle(name, 3);
  }
}

/** Keep polygon-owned edges for dependencies, but do not print a second caption. */
export function hideDuplicateBoundaryLabels(api: GGBApi, names = api.getAllObjectNames("segment")) {
  const groups = new Map<string, { name: string; boundary: boolean }[]>();
  for (const name of api.getAllObjectNames("segment")) {
    const match = api.getCommandString(name, false).match(/^Segment[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)(\s*,)?/);
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
