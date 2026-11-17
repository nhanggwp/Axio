/** Viewport and selection are UI state, not mathematical document edits. */
export function constructionKey(xml: string) {
  return xml.match(/<construction\b[\s\S]*?<\/construction>/)?.[0] ?? xml;
}
export function normalizeClientEvent(input: unknown): {
  type: string;
  target?: string;
  argument?: unknown;
  targets?: string[];
} {
  const e = input as {
    type?: string;
    target?: string;
    argument?: unknown;
    targets?: string[];
    [key: number]: unknown;
  };
  return {
    type: e.type ?? String(e[0] ?? ""),
    target: e.target ?? (typeof e[1] === "string" ? e[1] : undefined),
    argument: e.argument ?? e[2],
    targets: e.targets,
  };
}

export function supportsStroke(type: string) {
  return [
    "line",
    "segment",
    "ray",
    "vector",
    "polygon",
    "triangle",
    "quadrilateral",
    "pentagon",
    "hexagon",
    "circle",
    "conic",
    "conicpart",
    "arc",
    "sector",
    "angle",
    "polyline",
    "locus",
    "function",
    "curve",
    "ellipse",
    "hyperbola",
    "parabola",
  ].includes(type);
}

/** Native arcs fill the circular segment bounded by their arc and chord. */
export function supportsFill(type: string) {
  return ["polygon", "triangle", "quadrilateral", "pentagon", "hexagon", "heptagon", "octagon", "nonagon", "decagon", "circle", "ellipse", "conic", "conicpart", "arc", "sector", "angle"].includes(type);
}
export function fillingFromXML(xml: string): number {
  const alpha = Number(xml.match(/<objColor\b[^>]*\balpha="([^"]+)"/)?.[1] ?? 0);
  return Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
}
