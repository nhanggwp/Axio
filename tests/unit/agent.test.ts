import { describe, it, expect } from "vitest";
import {
  finalizeReply,
  inferredReferences,
} from "../../server/services/agent";
import { replySchema, requestSchema } from "../../shared/actions";
const request = (extra: Record<string, unknown> = {}) =>
  requestSchema.parse({
    request: "Cho đường này vuông góc.",
    selection: null,
    selections: [],
    objects: [],
    conversation: [],
    ...extra,
  });
const clarification = () =>
  replySchema.parse({
    status: "needs_clarification",
    message: "Bạn muốn đường nào vuông góc với đường nào?",
    missing_parameters: ["reference_line"],
    selection_request: {
      allowed_types: ["line", "segment", "ray"],
      min: 1,
      max: 1,
    },
    actions: [],
  });
describe("agent state contract", () => {
  it("no construction is allowed before clarification", () => {
    expect(
      replySchema.safeParse({
        ...clarification(),
        actions: [{ type: "point", label: "A", x: 0, y: 0 }],
      }).success,
    ).toBe(false);
    expect(
      replySchema.safeParse({
        status: "explanation",
        message: "Giải thích",
        actions: [{ type: "delete", target: "A" }],
      }).success,
    ).toBe(false);
  });
  it("retains the original intent and resolved parameters across selection turns", () => {
    const first = finalizeReply(clarification(), request());
    expect(first.pending?.step).toBe(1);
    const second = finalizeReply(
      replySchema.parse({
        ...clarification(),
        missing_parameters: ["through_point"],
        selection_request: { allowed_types: ["point"], min: 1, max: 1 },
        pending: { ...first.pending!, resolved: { reference_line: "AB" } },
      }),
      request({ request: "Đã chọn AB", pending: first.pending }),
    );
    expect(second.pending?.original_request).toBe("Cho đường này vuông góc.");
    expect(second.pending?.resolved.reference_line).toBe("AB");
    expect(second.pending?.step).toBe(2);
    const third = finalizeReply(
      clarification(),
      request({ request: "Thông tin thêm", pending: second.pending }),
    );
    expect(third.pending?.resolved.reference_line).toBe("AB");
  });
  it("preserves a model plan when the user explicitly delegates circle placement", () => {
    const result = finalizeReply(
      replySchema.parse({
        status: "ready_to_preview",
        message: "Vẽ đường tròn",
        actions: [
          { type: "point", label: "O", x: 0, y: 0 },
          {
            type: "construct",
            kind: "circle_radius",
            label: "c",
            refs: ["O"],
            value: 5,
          },
        ],
      }),
      request({ request: "Vẽ đường tròn bán kính 5, tự chọn vị trí cho hợp lý." }),
    );
    expect(result.status).toBe("ready_to_preview");
    expect(result.source).toBe("deepseek");
    expect(result.actions).toHaveLength(2);
    expect(result.pending).toBeNull();
  });
  it("passes unique triangle and selected-object references to the planner", () => {
    const data = request({
      selection: "A",
      selections: ["A"],
      objects: [
        {
          name: "A",
          type: "point",
          value: "(0,0)",
          definition: "(0,0)",
          independent: true,
          moveable: true,
          visible: true,
          color: "#23232D",
        },
        {
          name: "tri",
          type: "triangle",
          value: "6",
          definition: "Polygon[A, B, C]",
          independent: false,
          moveable: false,
          visible: true,
          color: "#23232D",
        },
      ],
    });
    expect(inferredReferences(data)).toEqual({
      selected: [{ name: "A", type: "point" }],
      triangles: [{ name: "tri", vertices: ["A", "B", "C"] }],
    });
  });
  it("ends a repeated clarification chain but allows a new request or an answer", () => {
    const body = request({
      pending: {
        id: "pending",
        original_request: "Lệnh gốc",
        intent: "perpendicular",
        resolved: { reference_line: "AB" },
        missing_parameters: ["through_point"],
        selection_request: { allowed_types: ["point"], min: 1, max: 1 },
        step: 4,
      },
    });
    const result = finalizeReply(clarification(), body);
    expect(result.status).toBe("explanation");
    expect(result.pending).toBeNull();
    const next = finalizeReply(replySchema.parse({ ...clarification(), intent_relation: "replace" }), { ...body, request: "Vẽ đường tròn bán kính 5." });
    expect(next.pending?.step).toBe(1);
    expect(next.pending?.original_request).toBe("Vẽ đường tròn bán kính 5.");
    const answered = finalizeReply(replySchema.parse({ status: "ready_to_preview", message: "Đề xuất dựng điểm.", actions: [{ type: "point", label: "P", x: 2, y: 3 }] }), body);
    expect(answered.status).toBe("ready_to_preview");
    expect(answered.pending).toBeNull();
  });
  it("preserves a pending construction during an explanatory aside", () => {
    const first = finalizeReply(clarification(), request());
    const aside = finalizeReply(replySchema.parse({ status: "explanation", intent_relation: "aside", message: "Hai đường vuông góc tạo góc 90 độ.", actions: [] }), request({ request: "Vuông góc là gì?", pending: first.pending }));
    expect(aside.pending).toEqual(first.pending);
    expect(aside.actions).toEqual([]);
  });
  it("impossible operations carry no actions", () =>
    expect(
      replySchema.safeParse({
        status: "impossible",
        message: "Ba cạnh không thỏa bất đẳng thức tam giác.",
        actions: [],
      }).success,
    ).toBe(true));
});
