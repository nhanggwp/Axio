import { describe, it, expect } from "vitest";
import { compileExpression } from "../../src/geometry/ExpressionInput";
const api = {
  exists: (n: string) => ["a", "f"].includes(n),
  getObjectType: (n: string) => (n === "f" ? "function" : "numeric"),
};
describe("mathematical input compiler", () => {
  it("supports equations, functions, points, implicit multiplication and dependencies", () => {
    for (const expression of [
      "y=x^2",
      "x^2+y^2=9",
      "c:x^2+y^2=9",
      "d:2x+y=6",
      "f(x)=sin(x)",
      "A=(-2,3)",
      "P=(2,f(2))",
      "g(x)=a*x+1",
      "2(x+1)",
    ])
      expect(compileExpression(expression, api).command).toBeTruthy();
  });
  it("preserves exponent and unary precedence", () => {
    expect(compileExpression("f(x)=-x^2", api).command).toBe("f(x)=(-(x^2))");
    expect(compileExpression("f(x)=2^3^2", api).command).toBe("f(x)=(2^(3^2))");
  });
  it("rejects scripts, multiple expressions, unknown names and incomplete syntax before evaluation", () => {
    for (const expression of [
      "Delete(A)",
      'Execute("Delete(A)")',
      "A=(1,2);Delete(A)",
      "f(x)=(",
      "y=b*x",
      "x=[1,2]",
      "A=(1,2)\nB=(3,4)",
    ])
      expect(() => compileExpression(expression, api)).toThrow();
  });
});
