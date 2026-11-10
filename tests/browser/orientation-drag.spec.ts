import { test, expect, type Page } from "../fixtures";
import { draggableTriangle } from "../helpers/draggableTriangle";
import { fixedRightTriangle } from "../helpers/fixedTriangle";
import { replySchema, type GeometryAction } from "../../shared/actions";
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
}
async function ask(page: Page, request: string) {
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(request);
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 30000 });
}
async function position(page: Page, name: string) {
  return page.evaluate((n) => {
    const a = window.axio!.adapter.api, v = JSON.parse(a.getViewProperties(1)), r = document.querySelector(".EuclidianPanel")!.getBoundingClientRect();
    return { x: r.left + (a.getXcoord(n) - v.xMin) / v.invXscale, y: r.top + v.height - (a.getYcoord(n) - v.yMin) / v.invYscale };
  }, name);
}
test("wrong intersection directions fail checks; preview corrections receive measured preview coordinates", async ({ page }) => {
  await ready(page);
  const wrong = replySchema.parse({ ...fixedRightTriangle, checks: [...fixedRightTriangle.checks, ...draggableTriangle.checks.filter((c) => c.kind === "coordinate_order")] });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/assist", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: requests.length === 1 ? wrong : draggableTriangle });
  });
  await ask(page, "Đặt A ở dưới trái, B bên phải và C bên trên.");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ validation_feedback: { message: expect.stringMatching(/ở bên trái|ở bên dưới/) } });
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await ask(page, "Giữ hình đó, giải thích vị trí A.");
  expect(requests[2]).toMatchObject({ objects: [], preview_objects: expect.arrayContaining([expect.objectContaining({ name: "A", x: 0, y: 0 })]) });
});
test("applying returns to Move and real pointer drags preserve fixed lengths, altitude, undo and reload", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.axio!.setMode(5));
  await page.route("**/api/assist", (route) => route.fulfill({ json: draggableTriangle }));
  await ask(page, "Vẽ tam giác vuông có điểm kéo được.");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.adapter.api.getMode())).toBe(0);
  const before = await page.evaluate(() => { const a = window.axio!.adapter.api; return { x: a.getXcoord("B"), y: a.getYcoord("B") }; });
  await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector(".EuclidianPanel")!.getBoundingClientRect().width)).toBeGreaterThan(900);
  const widthBeforeDrag = await page.evaluate(() => document.querySelector(".workspace")!.getBoundingClientRect().width);
  const p = await position(page, "B");
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  expect(await page.evaluate(() => document.querySelector(".workspace")!.getBoundingClientRect().width)).toBe(widthBeforeDrag);
  await page.mouse.move(p.x - 25, p.y - 55, { steps: 16 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.axio!.adapter.api.getYcoord("B"))).not.toBeCloseTo(before.y);
  const inspect = () => page.evaluate(() => { const a = window.axio!.adapter.api; return { AB: a.getValue("AB"), AC: a.getValue("AC"), AH: a.getValue("AH"), By: a.getYcoord("B"), Cx: a.getXcoord("C"), circles: window.axio!.objects.filter((o) => o.type === "circle" && o.visible).length }; });
  const moved = await inspect();
  expect(moved.AB).toBeCloseTo(9); expect(moved.AC).toBeCloseTo(12); expect(moved.AH).toBeCloseTo(7.2); expect(moved.circles).toBe(0);
  expect(moved.Cx).not.toBeCloseTo(0);
  const cPos = await position(page, "C");
  await page.mouse.move(cPos.x, cPos.y); await page.mouse.down(); await page.mouse.move(cPos.x + 40, cPos.y + 20, { steps: 12 }); await page.mouse.up();
  const movedViaC = await inspect();
  expect(movedViaC.Cx).not.toBeCloseTo(moved.Cx);
  expect(movedViaC.AB).toBeCloseTo(9); expect(movedViaC.AC).toBeCloseTo(12); expect(movedViaC.AH).toBeCloseTo(7.2);
  await page.evaluate(() => window.axio!.undo());
  expect((await inspect()).Cx).toBeCloseTo(moved.Cx);
  await page.evaluate(() => window.axio!.undo());
  expect((await inspect()).By).toBeCloseTo(before.y);
  await page.evaluate(() => window.axio!.redo());
  expect((await inspect()).By).toBeCloseTo(moved.By);
  await page.locator(".explorer").getByRole("button", { name: /^B \(/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Tọa độ y" })).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Tọa độ y" }).fill("2");
  await page.getByRole("spinbutton", { name: "Tọa độ y" }).blur();
  expect((await inspect()).AB).toBeCloseTo(9);
  await expect(page.locator(".session-save-status")).toHaveText("Đã lưu phiên cục bộ");
  await page.reload();
  await expect(page.getByRole("button", { name: "Tạo phiên mới", exact: true })).toBeEnabled({ timeout: 60000 });
  expect(await page.evaluate(() => window.axio!.adapter.api.isMoveable("B"))).toBe(true);
  expect((await inspect()).AB).toBeCloseTo(9);
});

test("a dilation of two free points cannot pretend to keep a given length during dragging", async ({ page }) => {
  await ready(page);
  const bad = replySchema.parse({ ...draggableTriangle, actions: draggableTriangle.actions.flatMap<GeometryAction>((a) => a.type === "construct" && a.kind === "point_on" ? [
    { type: "point", label: "D", x: 1, y: 0, auxiliary: true },
    { type: "construct", label: "B", kind: "dilate", refs: ["D", "A"], value: 9, auxiliary: false },
  ] : [a]), checks: draggableTriangle.checks.filter((c) => c.kind !== "moveable") });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/assist", (route) => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: requests.length === 1 ? bad : draggableTriangle }); });
  await ask(page, "Giữ AB bằng 9 và AC bằng 12 khi kéo điểm.");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ validation_feedback: { message: expect.stringContaining("Ràng buộc mất khi thử di chuyển") } });
});

test("legacy figures with hidden direction helpers still allow dragging A, B and C smoothly", async ({ page }) => {
  await ready(page);
  await page.route("**/api/assist", (route) => route.fulfill({ json: fixedRightTriangle }));
  await ask(page, "Vẽ tam giác vuông.");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const bPos = await position(page, "B");
  await page.mouse.move(bPos.x, bPos.y); await page.mouse.down(); await page.mouse.move(bPos.x, bPos.y - 50, { steps: 12 }); await page.mouse.up();
  const afterB = await page.evaluate(() => { const a = window.axio!.adapter.api; return { By: a.getYcoord("B"), AB: a.getValue("AB"), AC: a.getValue("AC"), AH: a.getValue("AH") }; });
  expect(Math.abs(afterB.By)).toBeGreaterThan(0.5);
  expect(afterB.AB).toBeCloseTo(9); expect(afterB.AC).toBeCloseTo(12); expect(afterB.AH).toBeCloseTo(7.2);
});
