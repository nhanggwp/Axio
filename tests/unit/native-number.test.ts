import { expect, it } from "vitest";
import { nativeNumber } from "../../src/geometry/nativeNumber";
it("writes near-zero coordinates as decimal literals instead of Euler expressions", () => {
  expect(nativeNumber(1e-16)).toBe("0.0000000000000001");
  expect(nativeNumber(-8.833050219287055e-16)).toBe(
    "-0.0000000000000008833050219287055",
  );
});
it("round-trips finite doubles without an ambiguous exponent marker", () => {
  for (const n of [
    0,
    -0,
    Math.PI,
    -4.3,
    1e21,
    1.23456789e-30,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ]) {
    const s = nativeNumber(n);
    expect(s).not.toMatch(/[eE]/);
    expect(Number(s)).toBe(n === 0 ? 0 : n);
  }
  expect(() => nativeNumber(NaN)).toThrow();
  expect(() => nativeNumber(Infinity)).toThrow();
});
