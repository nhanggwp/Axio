import { describe, it, expect } from "vitest";
import {
  solidKinds,
  solidTopology,
  solidVertexPositions,
  hiddenSolidEdges,
} from "../../shared/solids";
import { actionSchema } from "../../shared/actions";
describe("projected solid topology", () => {
  for (const kind of solidKinds)
    it(`${kind} is closed, has no duplicate edges and obeys Euler's formula`, () => {
      const t = solidTopology(kind),
        vertices = t.base.length * 2;
      expect(vertices - t.edges.length + t.faces.length).toBe(2);
      expect(
        new Set(
          t.edges.map((edge) => [...edge].sort((a, b) => a - b).join(",")),
        ).size,
      ).toBe(t.edges.length);
      for (const [a, b] of t.edges) {
        expect(
          t.faces.filter((face) =>
            face.some(
              (v, i) =>
                (v === a && face[(i + 1) % face.length] === b) ||
                (v === b && face[(i + 1) % face.length] === a),
            ),
          ),
        ).toHaveLength(2);
      }
      for (let i = 0; i < vertices; i++)
        expect(t.edges.filter((edge) => edge.includes(i))).toHaveLength(3);
    });
  it("reclassifies visibility for the projection and ignores translation and in-plane rotation", () => {
    const t = solidTopology("cuboid"),
      p = solidVertexPositions("cuboid", { width: 4, depth: 3, height: 3 });
    const right = p.map((v) => ({ x: v.x + 0.55 * v.y, y: v.z + 0.35 * v.y }));
    const hidden = hiddenSolidEdges(right, t.faces, t.edges);
    expect(hidden.filter(Boolean)).toHaveLength(3);
    const angle = 0.7,
      changed = right.map((v) => ({
        x: 1e4 + v.x * Math.cos(angle) - v.y * Math.sin(angle),
        y: 1e4 + v.x * Math.sin(angle) + v.y * Math.cos(angle),
      }));
    expect(hiddenSolidEdges(changed, t.faces, t.edges)).toEqual(hidden);
    const left = p.map((v) => ({ x: v.x - 0.55 * v.y, y: v.z + 0.35 * v.y }));
    expect(hiddenSolidEdges(left, t.faces, t.edges)).not.toEqual(hidden);
    expect(
      hiddenSolidEdges(left, t.faces, t.edges).filter(Boolean),
    ).toHaveLength(3);
  });
  it("accepts bounded solid and mode actions and rejects injected names and invalid dimensions", () => {
    for (const kind of solidKinds)
      expect(
        actionSchema.safeParse({
          type: "solid",
          kind,
          label: "s",
          vertices:
            kind === "triangular_prism"
              ? ["A", "B", "C", "A'", "B'", "C'"]
              : ["A", "B", "C", "D", "A'", "B'", "C'", "D'"],
        }).success,
      ).toBe(true);
    expect(
      actionSchema.safeParse({ type: "space_mode", enabled: true }).success,
    ).toBe(true);
    expect(
      actionSchema.safeParse({ type: "space_mode", enabled: "true" }).success,
    ).toBe(false);
    for (const width of [0, -1, Infinity, 10001])
      expect(
        actionSchema.safeParse({
          type: "solid",
          kind: "cuboid",
          label: "s",
          dimensions: { width, depth: 3, height: 4 },
        }).success,
      ).toBe(false);
    expect(
      actionSchema.safeParse({
        type: "solid",
        kind: "cube",
        label: "s);Delete(A)",
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({ type: "solid", kind: "sphere", label: "s" })
        .success,
    ).toBe(false);
  });
});
