import { test, expect } from "../fixtures";

test("incircle, circumcircle and triangle centers retain their mathematical dependencies", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await page.evaluate(() => window.axio!.apply([
    { type: "point", label: "P", x: 0, y: 0 },
    { type: "point", label: "Q", x: 6, y: 0 },
    { type: "point", label: "R", x: 0, y: 8 },
    { type: "construct", kind: "polygon", label: "tri", refs: ["P", "Q", "R"] },
    { type: "construct", kind: "incircle", label: "ci", refs: ["tri"] },
    { type: "construct", kind: "circumcircle", label: "co", refs: ["P", "Q", "R"] },
    { type: "construct", kind: "incenter", label: "I", refs: ["tri"] },
    { type: "construct", kind: "circumcenter", label: "O", refs: ["P", "Q", "R"] },
    { type: "construct", kind: "centroid", label: "G", refs: ["tri"] },
    { type: "construct", kind: "orthocenter", label: "H", refs: ["tri"] },
    { type: "construct", kind: "center", label: "T", refs: ["ci"] },
  ]));
  const measure = () => page.evaluate(() => {
    const a = window.axio!.adapter.api;
    a.evalCommand("testRi=Radius(ci)"); a.evalCommand("testRo=Radius(co)");
    const point = (name: string) => [a.getXcoord(name), a.getYcoord(name)];
    return { ri: a.getValue("testRi"), ro: a.getValue("testRo"), I: point("I"), O: point("O"), G: point("G"), H: point("H"), T: point("T"), vertices: [point("P"), point("Q"), point("R")], independent: [a.isIndependent("ci"), a.isIndependent("co"), a.isIndependent("I")] };
  });
  const initial = await measure();
  expect(initial.ri).toBeCloseTo(2); expect(initial.ro).toBeCloseTo(5);
  expect(initial.I[0]).toBeCloseTo(2); expect(initial.I[1]).toBeCloseTo(2);
  expect(initial.O[0]).toBeCloseTo(3); expect(initial.O[1]).toBeCloseTo(4);
  expect(initial.G[0]).toBeCloseTo(2); expect(initial.G[1]).toBeCloseTo(8 / 3);
  expect(initial.H[0]).toBeCloseTo(0); expect(initial.H[1]).toBeCloseTo(0);
  expect(initial.T[0]).toBeCloseTo(initial.I[0]); expect(initial.T[1]).toBeCloseTo(initial.I[1]);
  expect(initial.independent).toEqual([false, false, false]);
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "Q", x: 9, y: 2 }]));
  const moved = await measure();
  expect(moved.ri).not.toBeCloseTo(initial.ri);
  for (let i = 0; i < 3; i++) {
    const [x, y] = moved.vertices[i], [u, v] = moved.vertices[(i + 1) % 3];
    const distanceToSide = Math.abs((u - x) * (moved.I[1] - y) - (v - y) * (moved.I[0] - x)) / Math.hypot(u - x, v - y);
    expect(distanceToSide).toBeCloseTo(moved.ri);
    expect(Math.hypot(moved.O[0] - x, moved.O[1] - y)).toBeCloseTo(moved.ro);
  }
  const before = await page.evaluate(() => window.axio!.objects.map((o) => o.name));
  const error = await page.evaluate(() => {
    try { window.axio!.apply([
      { type: "point", label: "U", x: 1, y: 1 },
      { type: "point", label: "V", x: 2, y: 2 },
      { type: "point", label: "W", x: 3, y: 3 },
      { type: "construct", kind: "incircle", label: "bad", refs: ["U", "V", "W"] },
    ]); return ""; } catch (error) { return String(error); }
  });
  expect(error).toContain("thẳng hàng");
  expect(await page.evaluate(() => window.axio!.objects.map((o) => o.name))).toEqual(before);
});

test("circle constructions resolve a regular triangle's generated vertex", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await page.evaluate(() => window.axio!.apply([
    { type: "point", label: "U", x: 0, y: 0 }, { type: "point", label: "V", x: 4, y: 0 },
    { type: "construct", kind: "regular_polygon", label: "reg", refs: ["U", "V"], value: 3 },
    { type: "construct", kind: "incircle", label: "ci", refs: ["reg"] },
    { type: "construct", kind: "circumcircle", label: "co", refs: ["reg"] },
  ]));
  const state = await page.evaluate(() => ({ vertices: window.axio!.adapter.objects().find((o) => o.name === "reg")?.vertices, circles: ["ci", "co"].map((n) => window.axio!.adapter.api.isDefined(n)) }));
  expect(state.vertices).toHaveLength(3); expect(state.circles).toEqual([true, true]);
});
