import { describe, it, expect } from "vitest";
import {
  SelectionManager,
  affectedByDeletion,
} from "../../src/geometry/SelectionManager";
import {
  constructionKey,
  normalizeClientEvent,
} from "../../src/geometry/GeometryState";
import type { GeometryObject } from "../../shared/actions";
describe("selection and document projections", () => {
  it("deduplicates, validates and toggles names", () => {
    const s = new SelectionManager();
    s.set(["A", "A", "B", "ghost"], (n) => n !== "ghost");
    expect(s.names).toEqual(["A", "B"]);
    s.toggle("A");
    expect(s.names).toEqual(["B"]);
    s.toggle("C");
    expect(s.names).toEqual(["B", "C"]);
  });
  it("computes transitive cascade from actual definitions", () => {
    const objects = [
      { name: "A", definition: "(0,0)" },
      { name: "B", definition: "(3,0)" },
      { name: "AB", definition: "Segment[A, B]" },
      { name: "M", definition: "Midpoint[AB]" },
    ] as GeometryObject[];
    expect(affectedByDeletion(objects, ["A"])).toEqual(["A", "AB", "M"]);
  });
  it("normalizes both documented object and actual array-shaped applet events", () => {
    expect(
      normalizeClientEvent({ type: "deselect", target: "A" }),
    ).toMatchObject({ type: "deselect", target: "A" });
    expect(normalizeClientEvent(["select", "B"])).toMatchObject({
      type: "select",
      target: "B",
    });
  });
  it("viewport-only XML changes are not document changes", () => {
    expect(
      constructionKey("<gui>first</gui><construction><A/></construction>"),
    ).toBe(
      constructionKey("<gui>second</gui><construction><A/></construction>"),
    );
  });
});
