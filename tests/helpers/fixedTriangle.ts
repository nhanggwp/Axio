import { replySchema } from "../../shared/actions";

export const fixedRightTriangle = replySchema.parse({
  status: "ready_to_preview", message: "Dựng tam giác vuông với hai cạnh cố định và đường cao; ẩn các hình phụ.",
  actions: [
    { type: "point", label: "A", x: 0, y: 0, auxiliary: false },
    { type: "point", label: "D", x: 1000, y: 0, auxiliary: true },
    { type: "construct", label: "direction", kind: "line", refs: ["A", "D"], auxiliary: true },
    { type: "construct", label: "radiusB", kind: "circle_radius", refs: ["A"], value: 9, auxiliary: true },
    { type: "construct", label: "B", kind: "intersection", refs: ["direction", "radiusB"], value: 1, auxiliary: false },
    { type: "construct", label: "perp", kind: "perpendicular", refs: ["A", "direction"], auxiliary: true },
    { type: "construct", label: "radiusC", kind: "circle_radius", refs: ["A"], value: 12, auxiliary: true },
    { type: "construct", label: "C", kind: "intersection", refs: ["perp", "radiusC"], value: 1, auxiliary: false },
    { type: "construct", label: "AB", kind: "segment", refs: ["A", "B"], auxiliary: false },
    { type: "construct", label: "AC", kind: "segment", refs: ["A", "C"], auxiliary: false },
    { type: "construct", label: "BC", kind: "segment", refs: ["B", "C"], auxiliary: false },
    { type: "construct", label: "tri", kind: "polygon", refs: ["A", "B", "C"], auxiliary: false },
    { type: "altitude", vertex: "A", base: "BC", foot: "H", label: "AH" },
  ],
  checks: [{ kind: "perpendicular", refs: ["AB", "AC"] }, { kind: "on_segment", refs: ["H", "B", "C"] }, { kind: "dependent", refs: ["B", "C", "H"] }],
});
