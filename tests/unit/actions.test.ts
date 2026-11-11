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

describe("native history plans", () => {
  it("previews history without consuming it and preserves redo until a new edit", () => {
    const h = new ConstructionHistory();
    h.reset('<construction><point name="A"/></construction>');
    h.push('<construction><point name="B"/></construction>');
    const before = h.capture();
    expect(h.peek("undo")).toContain('name="A"');
    expect(h.capture()).toEqual(before);
    expect(h.undo()).toContain('name="A"');
    expect(h.peek("redo")).toContain('name="B"');
    h.push('<construction><point name="C"/></construction>');
    expect(h.peek("redo")).toBeUndefined();
  });
  it("never combines an undo with destructive edits or geometry checks", () => {
    const plan = {status:"ready_to_preview",message:"Xem trước hoàn tác",actions:[{type:"history",direction:"undo"}]};
    expect(replySchema.safeParse(plan).success).toBe(true);
    expect(replySchema.safeParse({...plan, actions:[...plan.actions,{type:"delete",target:"C"}]}).success).toBe(false);
    expect(replySchema.safeParse({...plan, checks:[{kind:"dependent",refs:["M"]}]}).success).toBe(false);
    expect(actionSchema.safeParse({type:"history",direction:"reset"}).success).toBe(false);
  });
});

it('accepts native Unicode names only for existing-object API targets',()=>{
 for(const target of ['α','Văn bảnAB','α_1',"A'"]){
  expect(actionSchema.safeParse({type:'style',target,color:'#E31665'}).success).toBe(true);
  expect(actionSchema.safeParse({type:'delete',target}).success).toBe(true);
 }
 expect(actionSchema.safeParse({type:'point',label:'α',x:0,y:0}).success).toBe(false);
 expect(actionSchema.safeParse({type:'style',target:'A)\nDelete(B)',color:'#E31665'}).success).toBe(false);
});

it('accepts bounded native coordinate view actions and rejects invalid flags or commands',()=>{
 expect(actionSchema.parse({type:'view',axes:true,grid:true})).toEqual({type:'view',axes:true,grid:true});
 expect(actionSchema.safeParse({type:'view',axes:'yes'}).success).toBe(false);
 expect(actionSchema.safeParse({type:'view',axes:true,command:'Execute(...)'}).success).toBe(false);
});
it('permits explicit label choices without accepting arbitrary caption commands',()=>{
 for(const label of ['name','value','name_value','hidden'])expect(actionSchema.safeParse({type:'style',target:'AB',label}).success).toBe(true);
 expect(actionSchema.safeParse({type:'style',target:'AB',label:'Execute(...)'}).success).toBe(false);
});
