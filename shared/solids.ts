export const solidKinds = [
  "cuboid",
  "cube",
  "triangular_prism",
  "quadrilateral_prism",
] as const;
export type SolidKind = (typeof solidKinds)[number];
export type Point2 = { x: number; y: number };
export type SolidDimensions = { width: number; depth: number; height: number };
export const solidNames: Record<SolidKind, string> = {
  cuboid: "Hình hộp chữ nhật",
  cube: "Hình lập phương",
  triangular_prism: "Lăng trụ đứng tam giác",
  quadrilateral_prism: "Lăng trụ đứng tứ giác",
};
export function solidTopology(kind: SolidKind) {
  const base: Point2[] =
    kind === "triangular_prism"
      ? [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0.4, y: 1 },
        ]
      : kind === "quadrilateral_prism"
        ? [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0.85, y: 1 },
            { x: 0.15, y: 0.9 },
          ]
        : [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ];
  const n = base.length;
  // Every face winds outwards in 3D. Its signed projected area faces the viewer.
  const faces = [
    [...base.keys()].reverse(),
    [...base.keys()].map((i) => i + n),
    ...base.map((_, i) => [i, (i + 1) % n, ((i + 1) % n) + n, i + n]),
  ];
  const edges = [
    ...base.map((_, i) => [i, (i + 1) % n]),
    ...base.map((_, i) => [i + n, ((i + 1) % n) + n]),
    ...base.map((_, i) => [i, i + n]),
  ];
  return { base, faces, edges };
}
export function hiddenSolidEdges(
  points: Point2[],
  faces: number[][],
  edges: number[][],
): boolean[] {
  const span = Math.max(
    1,
    ...points.map((p) => Math.hypot(p.x - points[0].x, p.y - points[0].y)),
  );
  const front = faces.map(
    (face) =>
      face.reduce((sum, index, i) => {
        const a = points[index],
          b = points[face[(i + 1) % face.length]];
        return (
          sum +
          (a.x - points[0].x) * (b.y - points[0].y) -
          (a.y - points[0].y) * (b.x - points[0].x)
        );
      }, 0) >=
      -1e-9 * span * span,
  );
  return edges.map(
    ([a, b]) =>
      !faces.some(
        (face, index) =>
          front[index] &&
          face.some(
            (v, i) =>
              (v === a && face[(i + 1) % face.length] === b) ||
              (v === b && face[(i + 1) % face.length] === a),
          ),
      ),
  );
}
export function solidVertexPositions(kind: SolidKind, d: SolidDimensions) {
  const { base } = solidTopology(kind);
  return [0, d.height].flatMap((z) =>
    base.map((p) => ({ x: p.x * d.width, y: p.y * d.depth, z })),
  );
}
