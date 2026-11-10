import { geometryNames } from "../../shared/geometryNames";
import type { GGBApi } from "../types/geogebra";

export const POLYGON_TYPES = [
  "polygon",
  "triangle",
  "quadrilateral",
  "pentagon",
  "hexagon",
  "heptagon",
  "octagon",
  "nonagon",
  "decagon",
] as const;

export function isPolygonType(type: string): boolean {
  return (POLYGON_TYPES as readonly string[]).includes(type);
}

/** Resolve real point labels in order for any polygon, including regular polygons. */
export function polygonVertices(api: GGBApi, name: string): string[] {
  if (!api.exists(name) || !isPolygonType(api.getObjectType(name)))
    throw new Error(`Đối tượng ${name} phải là một đa giác.`);
  const isPoint = (label: string) => api.exists(label) && api.getObjectType(label) === "point";
  const direct = [...new Set(geometryNames(api.getCommandString(name, false)).slice(1).filter(isPoint))];
  if (direct.length >= 3) return direct;
  const xml = new DOMParser().parseFromString(api.getXML(), "application/xml");
  for (const command of xml.querySelectorAll('construction > command[name="Polygon"]')) {
    const output = command.querySelector("output");
    if (!output || !Array.from(output.attributes).some((a) => a.value === name)) continue;
    const labels = [
      ...Array.from(command.querySelector("input")?.attributes ?? []),
      ...Array.from(output.attributes),
    ]
      .map((a) => a.value)
      .filter(isPoint);
    const unique = [...new Set(labels)];
    if (unique.length >= 3) return unique;
  }
  throw new Error("Không thể xác định các đỉnh của đa giác này.");
}

/** Resolve real point labels for a 3-vertex triangle. */
export function triangleVertices(api: GGBApi, name: string): string[] {
  if (!api.exists(name) || !isPolygonType(api.getObjectType(name)))
    throw new Error(`Đối tượng ${name} phải là một tam giác.`);
  const vertices = polygonVertices(api, name);
  if (vertices.length === 3) return vertices;
  throw new Error("Không thể xác định đủ ba đỉnh thật của tam giác này.");
}
