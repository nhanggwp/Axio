import { replySchema } from "../../shared/actions";
export const draggableTriangle = replySchema.parse({
  status: "ready_to_preview", message: "A ở dưới trái; kéo A để di chuyển, kéo B để xoay hình. Hai cạnh giữ nguyên độ dài.",
  actions: [
    { type: "point", label: "A", x: 0, y: 0, auxiliary: false },
    { type: "construct", kind: "circle_radius", label: "pathB", refs: ["A"], value: 9, auxiliary: true },
    { type: "construct", kind: "point_on", label: "B", refs: ["pathB"], position: { x: 9, y: 0 }, auxiliary: false },
    { type: "construct", kind: "rotate", label: "turnedB", refs: ["B", "A"], value: 90, auxiliary: true },
    { type: "construct", kind: "dilate", label: "C", refs: ["turnedB", "A"], value: 12 / 9, auxiliary: false },
    { type: "construct", kind: "segment", label: "AB", refs: ["A", "B"], auxiliary: false },
    { type: "construct", kind: "segment", label: "AC", refs: ["A", "C"], auxiliary: false },
    { type: "construct", kind: "segment", label: "BC", refs: ["B", "C"], auxiliary: false },
    { type: "altitude", vertex: "A", base: "BC", foot: "H", label: "AH" },
  ], checks: [
    { kind: "distance", refs: ["A", "B"], value: 9 }, { kind: "distance", refs: ["A", "C"], value: 12 },
    { kind: "perpendicular", refs: ["AB", "AC"] }, { kind: "perpendicular", refs: ["AH", "BC"] },
    { kind: "on_segment", refs: ["H", "B", "C"] }, { kind: "moveable", refs: ["A", "B"] },
    { kind: "coordinate_order", refs: ["A", "B"], axis: "x" }, { kind: "coordinate_order", refs: ["A", "C"], axis: "y" },
  ],
});
