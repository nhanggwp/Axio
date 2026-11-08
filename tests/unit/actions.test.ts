import { describe, it, expect } from "vitest";
import { replySchema, actionSchema } from "../../shared/actions";
import { ConstructionHistory } from "../../src/geometry/ConstructionHistory";
describe("untrusted AI data", () => {
  it("rejects code, injected labels, unknown fields and nonfinite values", () => {
    expect(
      actionSchema.safeParse({ type: "javascript", code: "alert(1)" }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        type: "point",
        label: "A)\nDelete(B)",
        x: 0,
        y: 0,
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({ type: "point", label: "A", x: Infinity, y: 0 })
        .success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        type: "point",
        label: "A",
        x: 0,
        y: 0,
        code: "bad",
      }).success,
    ).toBe(false);
  });
  it("requires empty action list during clarification", () =>
    expect(
      replySchema.safeParse({
        message: "Chọn đường nào?",
        status: "needs_clarification",
        actions: [{ type: "point", label: "A", x: 0, y: 0 }],
      }).success,
    ).toBe(false));
  it("bounds action count", () =>
    expect(
      replySchema.safeParse({
        message: "test",
        status: "ready_to_preview",
        actions: Array.from({ length: 33 }, () => ({
          type: "delete",
          target: "A",
        })),
      }).success,
    ).toBe(false));
});
describe("document history", () => {
  it("groups snapshots and invalidates a redo branch after editing", () => {
    const h = new ConstructionHistory();
    h.reset("a");
    h.push("b");
    h.push("b");
    expect(h.undo()).toBe("a");
    expect(h.redo()).toBe("b");
    h.undo();
    h.push("c");
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe("a");
  });
});
