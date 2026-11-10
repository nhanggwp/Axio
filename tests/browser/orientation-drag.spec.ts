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

test("polygon presets, auto-synthesized polygons and draw.io resize/rotate handles scale and rotate figures", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "ĐA GIÁC", exact: true }).click();
  await page.getByRole("button", { name: "Hình chữ nhật", exact: true }).click();
  await expect(page.getByTestId("transform-box")).toBeVisible();
  const rectBefore = await page.evaluate(() => {
    const c = window.axio!, api = c.adapter.api;
    const poly = c.objects.find((o) => o.type === "quadrilateral" || o.type === "polygon")!;
    return {
      name: poly.name,
      displayName: poly.displayName,
      vertices: poly.vertices,
      area: api.getValue(poly.name),
    };
  });
  expect(rectBefore.vertices).toHaveLength(4);
  expect(rectBefore.displayName).toBe("ABCD");
  const seHandle = await page.getByRole("button", { name: "Co giãn góc dưới phải" }).boundingBox();
  await page.mouse.move(seHandle!.x + seHandle!.width / 2, seHandle!.y + seHandle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(seHandle!.x + 60, seHandle!.y + 45, { steps: 10 });
  await page.mouse.up();
  const rectAfterScale = await page.evaluate((name) => window.axio!.adapter.api.getValue(name), rectBefore.name);
  expect(rectAfterScale).toBeGreaterThan(rectBefore.area * 1.15);

  await page.evaluate(() => window.axio!.newDocument());
  await page.getByRole("button", { name: "Ẩn / hiện trợ lý AI", exact: true }).click();
  await page.route("**/api/assist", (route) => route.fulfill({ json: draggableTriangle }));
  await ask(page, "Vẽ tam giác vuông.");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const synthPoly = await page.evaluate(() => window.axio!.objects.find((o) => o.type === "triangle" || o.type === "polygon"));
  expect(synthPoly?.displayName).toBe("ABC");
  await page.evaluate((name) => window.axio!.select(name), synthPoly!.name);
  await expect(page.getByTestId("transform-box")).toBeVisible();
  const triSe = await page.getByRole("button", { name: "Co giãn góc dưới phải" }).boundingBox();
  await page.mouse.move(triSe!.x + triSe!.width / 2, triSe!.y + triSe!.height / 2);
  await page.mouse.down();
  await page.mouse.move(triSe!.x + 70, triSe!.y + 70, { steps: 12 });
  await page.mouse.up();
  const scaledTri = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    return { AB: a.getValue("AB"), AC: a.getValue("AC") };
  });
  expect(scaledTri.AB).toBeGreaterThan(9.5);
  expect(scaledTri.AC / scaledTri.AB).toBeCloseTo(12 / 9, 2);
});

test("multi-selected figures with multiple hidden helpers allow dragging any point and unlinking constraints", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const c = window.axio!;
    c.apply([
      { type: "point", label: "A", x: -3, y: -2, auxiliary: false },
      { type: "point", label: "D", x: -3, y: 4, auxiliary: true },
      { type: "point", label: "E", x: -9, y: -2, auxiliary: true },
      { type: "construct", label: "lAE", kind: "line", refs: ["A", "E"], auxiliary: true },
      { type: "construct", label: "cB", kind: "circle_radius", refs: ["A"], value: 7, auxiliary: true },
      { type: "construct", label: "B", kind: "intersection", refs: ["lAE", "cB"], value: 1, auxiliary: false },
      { type: "construct", label: "pAC", kind: "line", refs: ["A", "D"], auxiliary: true },
      { type: "construct", label: "cC", kind: "circle_radius", refs: ["A"], value: 9, auxiliary: true },
      { type: "construct", label: "C", kind: "intersection", refs: ["pAC", "cC"], value: 1, auxiliary: false },
      { type: "construct", label: "AB", kind: "segment", refs: ["A", "B"], auxiliary: false },
      { type: "construct", label: "BC", kind: "segment", refs: ["B", "C"], auxiliary: false },
      { type: "construct", label: "AC", kind: "segment", refs: ["A", "C"], auxiliary: false },
      { type: "construct", label: "ABC", kind: "polygon", refs: ["A", "B", "C"], auxiliary: false },
      { type: "construct", label: "circ", kind: "circumcircle", refs: ["A", "B", "C"], auxiliary: false },
      { type: "construct", label: "angA", kind: "angle", refs: ["B", "A", "C"], auxiliary: false },
    ]);
    c.adapter.resetView();
    c.selectMany(c.objects.filter((o) => o.visible).map((o) => o.name));
  });

  // No duplicate AB rows in ObjectExplorer
  await expect(page.locator(".explorer .object-value b", { hasText: /^AB$/ })).toHaveCount(1);

  // Dragging A works even when all objects are selected and an angle exists at A
  const aBefore = await page.evaluate(() => ({
    ax: window.axio!.adapter.api.getXcoord("A"),
    bx: window.axio!.adapter.api.getXcoord("B"),
  }));
  const aPos = await position(page, "A");
  await page.mouse.move(aPos.x, aPos.y);
  await page.mouse.down();
  await page.mouse.move(aPos.x + 50, aPos.y - 30, { steps: 10 });
  await page.mouse.up();
  const aAfter = await page.evaluate(() => ({
    ax: window.axio!.adapter.api.getXcoord("A"),
    bx: window.axio!.adapter.api.getXcoord("B"),
  }));
  expect(aAfter.ax).toBeGreaterThan(aBefore.ax + 0.3);
  expect(aAfter.bx).toBeGreaterThan(aBefore.bx + 0.3);

  // Dragging B rotates both hidden drivers around A and updates C and the circumcircle
  const cBefore = await page.evaluate(() => window.axio!.adapter.api.getXcoord("C"));
  const bPos = await position(page, "B");
  await page.mouse.move(bPos.x, bPos.y);
  await page.mouse.down();
  await page.mouse.move(bPos.x + 35, bPos.y - 45, { steps: 10 });
  await page.mouse.up();
  const cAfter = await page.evaluate(() => window.axio!.adapter.api.getXcoord("C"));
  expect(Math.abs(cAfter - cBefore)).toBeGreaterThan(0.2);

  // Clicking "Xóa liên kết" turns B and C into free independent points and removes hidden helpers
  await page.getByRole("toolbar", { name: "Thao tác đối tượng" }).getByRole("button", { name: "Xóa liên kết" }).click();
  const unlinked = await page.evaluate(() => {
    const api = window.axio!.adapter.api;
    return {
      indA: api.isIndependent("A"),
      indB: api.isIndependent("B"),
      indC: api.isIndependent("C"),
      moveB: api.isMoveable("B"),
      moveC: api.isMoveable("C"),
      hasD: api.exists("D"),
      hasE: api.exists("E"),
      hasLAE: api.exists("lAE"),
      hasCirc: api.exists("circ") && api.isDefined("circ"),
    };
  });
  expect(unlinked).toEqual({
    indA: true,
    indB: true,
    indC: true,
    moveB: true,
    moveC: true,
    hasD: false,
    hasE: false,
    hasLAE: false,
    hasCirc: true,
  });

  // Now B can be dragged completely independently without moving A or C, while AB, BC, ABC, circ follow
  const coordsBeforeFreeDrag = await page.evaluate(() => {
    const api = window.axio!.adapter.api;
    return {
      ax: api.getXcoord("A"),
      cx: api.getXcoord("C"),
      ab: api.getValue("AB"),
    };
  });
  const bPos2 = await position(page, "B");
  await page.mouse.move(bPos2.x, bPos2.y);
  await page.mouse.down();
  await page.mouse.move(bPos2.x - 60, bPos2.y - 40, { steps: 10 });
  await page.mouse.up();
  const coordsAfterFreeDrag = await page.evaluate(() => {
    const api = window.axio!.adapter.api;
    return {
      ax: api.getXcoord("A"),
      cx: api.getXcoord("C"),
      ab: api.getValue("AB"),
      circDefined: api.isDefined("circ"),
    };
  });
  expect(coordsAfterFreeDrag.ax).toBeCloseTo(coordsBeforeFreeDrag.ax, 4);
  expect(coordsAfterFreeDrag.cx).toBeCloseTo(coordsBeforeFreeDrag.cx, 4);
  expect(coordsAfterFreeDrag.ab).not.toBeCloseTo(coordsBeforeFreeDrag.ab, 1);
  expect(coordsAfterFreeDrag.circDefined).toBe(true);
});
