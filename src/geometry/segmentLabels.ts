import type { GGBApi } from "../types/geogebra";

/** Display the actual endpoints; object IDs remain stable for dependencies and AI. */
export function segmentDisplayName(api: GGBApi, name: string): string | undefined {
  if (api.getObjectType(name) !== "segment") return;
  const match = api.getCommandString(name, false).match(/^Segment[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)/);
  if (!match) return;
  const endpoints = match.slice(1, 3);
  if (!endpoints.every((point) => api.exists(point) && api.getObjectType(point) === "point")) return;
  return endpoints.sort().join("");
}

export function formatSegmentLabels(api: GGBApi, names = api.getAllObjectNames("segment")) {
  for (const name of names) {
    const display = segmentDisplayName(api, name);
    if (!display) continue;
    const caption = `${display} = %v`;
    if (api.getCaption(name, false) !== caption) api.setCaption(name, caption);
    if (api.getLabelStyle(name) !== 3) api.setLabelStyle(name, 3);
  }
}
