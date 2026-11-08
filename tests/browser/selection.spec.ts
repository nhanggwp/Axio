import { seedTriangle } from "../helpers/sample";
import { test, expect, type Page } from "../fixtures";
async function ready(page: Page, sample = true) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await expect(page.locator(".session-loading")).toBeHidden();
  if (sample)
    await seedTriangle(page);
}
async function position(page: Page, name: string) {
  return page.evaluate((n) => {
    const a = window.axio!.adapter.api,
      v = JSON.parse(a.getViewProperties(1)),
      r = document.querySelector(".EuclidianPanel")!.getBoundingClientRect();
    return {
      x: r.left + (a.getXcoord(n) - v.xMin) / v.invXscale,
      y: r.top + v.height - (a.getYcoord(n) - v.yMin) / v.invYscale,
    };
  }, name);
}
async function marquee(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await expect(page.getByTestId("selection-marquee")).toBeVisible();
  await page.mouse.up();
}
test("blank production document, native single/modified clicks, explorer multi-select and clear", async ({
  page,
}) => {
  await ready(page, false);
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await seedTriangle(page);
  const a = await position(page, "A"),
    b = await position(page, "B");
  await page.mouse.click(a.x, a.y);
  await expect
    .poll(() => page.evaluate(() => window.axio!.selectedNames))
    .toEqual(["A"]);
  await expect(
    page.getByRole("toolbar", { name: "Thao tác đối tượng" }),
  ).toBeVisible();
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.evaluate(() => [...window.axio!.selectedNames].sort()))
    .toEqual(["A", "B"]);
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.evaluate(() => window.axio!.selectedNames))
    .toEqual(["A"]);
  await page
    .locator(".explorer")
    .getByRole("button", { name: "C (0, 4)", exact: true })
    .click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await expect
    .poll(() => page.evaluate(() => [...window.axio!.selectedNames].sort()))
    .toEqual(["A", "C"]);
  const canvas = await page.locator(".workspace").boundingBox();
  await page.mouse.click(canvas!.x + 70, canvas!.y + 110);
  await expect
    .poll(() => page.evaluate(() => window.axio!.selectedNames))
    .toEqual([]);
  await expect(
    page.getByRole("toolbar", { name: "Thao tác đối tượng" }),
  ).toBeHidden();
});
test("marquee selects by full containment after zoom and pan; Escape cancels", async ({
  page,
}) => {
  await ready(page, false);
  await page.evaluate(() => {
    const c = window.axio!;
    c.apply([
      { type: "point", label: "P", x: 0, y: 0 },
      { type: "point", label: "Q", x: 2, y: 1 },
      { type: "point", label: "R", x: 5, y: 4 },
      { type: "construct", label: "PQ", kind: "segment", refs: ["P", "Q"] },
    ]);
    c.adapter.api.setCoordSystem(-3, 8, -3, 8);
  });
  for (const change of [false, true]) {
    if (change)
      await page.evaluate(() =>
        window.axio!.adapter.api.setCoordSystem(-6, 10, -5, 11),
      );
    const p = await position(page, "P"),
      q = await position(page, "Q");
    await marquee(
      page,
      { x: p.x - 20, y: q.y - 20 },
      { x: q.x + 20, y: p.y + 20 },
    );
    await expect
      .poll(() => page.evaluate(() => [...window.axio!.selectedNames].sort()))
      .toEqual(["P", "PQ", "Q"]);
    await page.keyboard.press("Escape");
  }
  const p = await position(page, "P");
  await page.mouse.move(p.x - 25, p.y - 25);
  await page.mouse.down();
  await page.mouse.move(p.x + 25, p.y + 25, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-marquee")).toBeHidden();
  expect(await page.evaluate(() => window.axio!.selectedNames)).toEqual([]);
});
test("dependency-aware batch delete is confirmed and undone in one step", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator(".explorer")
    .getByRole("button", { name: "A (0, 0)", exact: true })
    .click();
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B (3, 0)", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.locator(".workspace").focus();
  await page.keyboard.press("Delete");
  const confirm = page.getByRole("dialog", { name: "Xác nhận xóa đối tượng" });
  await expect(confirm).toContainText("AH");
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("A"))).toBe(
    true,
  );
  await confirm
    .getByRole("button", { name: "Xóa và các hình phụ thuộc" })
    .click();
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("AH"))).toBe(
    false,
  );
  expect(
    await page.evaluate(() => window.axio!.adapter.api.exists("cABC")),
  ).toBe(false);
  await page.keyboard.press("Control+z");
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("AH")),
  ).toBeCloseTo(2.4);
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("A"))).toBe(
    true,
  );
});
test("context menu, floating styles and popover bounds, lock and keyboard focus", async ({
  page,
}) => {
  await ready(page);
  const b = await position(page, "B");
  await page.mouse.click(b.x, b.y, { button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Khóa / Mở khóa" }).click();
  expect(
    await page.evaluate(() => window.axio!.adapter.api.isMoveable("B")),
  ).toBe(false);
  await page
    .getByRole("toolbar", { name: "Thao tác đối tượng" })
    .getByRole("button", { name: /Kiểu nét/ })
    .click();
  const popover = page.locator(".style-popover");
  await expect(popover).toBeVisible();
  await page.getByRole("button", { name: "Đổi màu #E31665" }).click();
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getColor("B")),
  ).toBe("#E31665");
  const bounds = await popover.boundingBox(),
    canvas = await page.locator(".workspace").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(canvas!.x);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    canvas!.x + canvas!.width,
  );
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    canvas!.y + canvas!.height,
  );
  await page.keyboard.press("Escape");
  await page.locator(".workspace").focus();
  await page.keyboard.press("Control+a");
  expect(await page.evaluate(() => window.axio!.selectedNames.length)).toBe(
    await page.evaluate(
      () => window.axio!.objects.filter((o) => o.visible).length,
    ),
  );
  await page
    .getByRole("button", { name: "Ẩn / hiện trợ lý AI", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("giữ văn bản");
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .press("Backspace");
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("B"))).toBe(
    true,
  );
  await page.screenshot({ path: "docs/upgrade-contextual-tools.png" });
});
