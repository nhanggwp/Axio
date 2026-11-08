import type { GeometryAction } from "../../shared/actions";
/** Optional, explicitly requested demo. Never the default document. */
export const rightTriangleExample: GeometryAction[] = [
  { type: "point", label: "A", x: 0, y: 0 },
  { type: "point", label: "B", x: 3, y: 0 },
  { type: "point", label: "C", x: 0, y: 4 },
  { type: "construct", kind: "polygon", label: "ABC", refs: ["A", "B", "C"] },
  { type: "construct", kind: "segment", label: "AB", refs: ["A", "B"] },
  { type: "construct", kind: "segment", label: "BC", refs: ["B", "C"] },
  { type: "construct", kind: "segment", label: "AC", refs: ["C", "A"] },
  { type: "altitude", vertex: "A", base: "BC", foot: "H", label: "AH" },
  {
    type: "construct",
    kind: "circumcircle",
    label: "cABC",
    refs: ["A", "B", "C"],
  },
];
