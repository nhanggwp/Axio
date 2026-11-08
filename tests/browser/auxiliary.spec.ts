import { test, expect } from "../fixtures";
import { fixedRightTriangle } from "../helpers/fixedTriangle";

test("construction circles stay hidden in preview and source, with dynamic lengths and one caption per edge", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.route("**/api/assist", (route) => route.fulfill({ json: fixedRightTriangle }));
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Vẽ tam giác ABC vuông tại A, đường cao AH biết AB=9 cm, AC=12 cm.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 25000 });
  const preview = await page.evaluate(() => {
    const globals = window as unknown as Record<string, unknown>;
    const apis = Object.keys(globals).filter((name) => name.startsWith("ggb")).map((name) => globals[name] as import("../../src/types/geogebra").GGBApi);
    const api = apis.find((a) => typeof a?.getVisible === "function" && a.exists("radiusB"))!;
    return { circles: [api.getVisible("radiusB"), api.getVisible("radiusC")], objects: window.axio!.objects.length };
  });
  expect(preview).toEqual({ circles: [false, false], objects: 0 });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const inspect = () => page.evaluate(() => {
    const c = window.axio!, api = c.adapter.api;
    const captions = c.objects.filter((o) => o.type === "segment" && o.visible && o.labelVisible).map((o) => api.getCaption(o.name, true));
    return { AB: api.getValue("AB"), AC: api.getValue("AC"), AH: api.getValue("AH"), helpers: ["D", "direction", "perp", "radiusB", "radiusC"].map((name) => ({ name, visible: api.getVisible(name), defined: api.isDefined(name), auxiliary: c.objects.find((o) => o.name === name)!.auxiliary })), captions };
  });
  const original = await inspect();
  expect(original.AB).toBeCloseTo(9); expect(original.AC).toBeCloseTo(12); expect(original.AH).toBeCloseTo(7.2);
  expect(original.helpers.every((o) => o.defined && !o.visible && o.auxiliary)).toBe(true);
  for (const edge of ["AB", "AC", "BC", "AH"]) expect(original.captions.filter((caption) => caption.startsWith(`${edge} = `))).toHaveLength(1);
  await page.evaluate(() => { const c = window.axio!; c.adapter.resetView(); });
  expect(await page.evaluate(() => { const v = JSON.parse(window.axio!.adapter.api.getViewProperties(1)); return v.width * v.invXscale; })).toBeLessThan(50);
  await page.screenshot({ path: "docs/triangle-without-construction-circles.png" });
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "A", x: 1, y: 0.5 }]));
  const moved = await inspect();
  expect(moved.AB).toBeCloseTo(9); expect(moved.AC).toBeCloseTo(12); expect(moved.AH).toBeCloseTo(7.2);
  await expect(page.locator(".session-save-status")).toHaveText("Đã lưu phiên cục bộ");
  await page.reload();
  await expect(page.getByRole("button", { name: "Tạo phiên mới", exact: true })).toBeEnabled({ timeout: 60000 });
  expect((await inspect()).helpers.every((o) => o.defined && !o.visible && o.auxiliary)).toBe(true);
  await page.evaluate(() => window.axio!.apply([
    { type: "construct", label: "requestedCircle", kind: "circumcircle", refs: ["A", "B", "C"], auxiliary: false },
    { type: "style", target: "radiusB", visible: true },
  ]));
  expect(await page.evaluate(() => window.axio!.adapter.api.getVisible("requestedCircle"))).toBe(true);
  expect(await page.evaluate(() => window.axio!.adapter.api.getVisible("radiusB"))).toBe(true);
});
