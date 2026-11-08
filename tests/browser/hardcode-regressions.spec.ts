import { test, expect } from "../fixtures";

test("viewport controls follow actual engine state, native zoom and opened documents", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  const initial = await page.evaluate(() => {
    const c = window.axio!;
    c.markSaved();
    const before = JSON.parse(c.adapter.api.getViewProperties(1)).invXscale;
    c.adapter.api.setGridVisible(false);
    c.adapter.api.setAxesVisible(true, true);
    c.adapter.api.setPointCapture(1, 0);
    c.sync();
    return before;
  });
  await expect(page.getByRole("button", { name: "Ẩn / hiện lưới", exact: true })).not.toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Ẩn / hiện trục tọa độ", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Bám lưới: tắt", exact: true })).toBeVisible();
  await page.evaluate(() => window.axio!.adapter.api.evalCommand("ZoomIn(2)"));
  await expect(page.locator(".zoom span")).toHaveText("200%");
  const scale = await page.evaluate(() => JSON.parse(window.axio!.adapter.api.getViewProperties(1)).invXscale);
  await expect(page.locator(".zoom span")).toHaveText(`${Math.round(initial / scale * 100)}%`);
  expect(await page.evaluate(() => window.axio!.dirty)).toBe(false);
  await page.evaluate(async () => {
    const c = window.axio!;
    const data = await c.adapter.base64();
    c.adapter.api.setGridVisible(true);
    c.adapter.api.setAxesVisible(false, false);
    c.adapter.api.setPointCapture(1, 1);
    await c.openDocument(data);
  });
  await expect(page.getByRole("button", { name: "Bám lưới: tắt", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ẩn / hiện trục tọa độ", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".zoom span")).toHaveText("100%");
  await page.evaluate(() => window.axio!.newDocument());
  await expect(page.getByRole("button", { name: "Bám lưới: bật", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ẩn / hiện lưới", exact: true })).toHaveClass(/active/);
});

test("property controls show imported widths and mixed selections without invented defaults", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await page.evaluate(() => {
    const c = window.axio!;
    c.apply([
      { type: "point", label: "P", x: 0, y: 0 }, { type: "point", label: "Q", x: 2, y: 0 },
      { type: "point", label: "R", x: 0, y: 1 }, { type: "point", label: "S", x: 2, y: 1 },
      { type: "construct", kind: "segment", label: "PQ", refs: ["P", "Q"] },
      { type: "construct", kind: "segment", label: "RS", refs: ["R", "S"] },
      { type: "style", target: "PQ", thickness: 4 }, { type: "style", target: "RS", thickness: 6 },
    ]);
    c.mutate(() => c.adapter.api.setLineStyle("PQ", 4));
    c.select("PQ");
  });
  await page.getByRole("toolbar", { name: "Thao tác đối tượng" }).getByRole("button", { name: "Thuộc tính", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Độ dày", exact: true })).toHaveValue("4");
  await expect(page.getByRole("combobox", { name: "Kiểu nét", exact: true })).toHaveValue("4");
  await page.evaluate(() => window.axio!.selectMany(["PQ", "RS"]));
  const common = page.locator(".inspector").getByRole("combobox", { name: "Độ dày chung", exact: true });
  await expect(common).toHaveValue("");
  await expect(common.locator("option:checked")).toHaveText("Nhiều giá trị");
  await common.selectOption("9");
  expect(await page.evaluate(() => ["PQ", "RS"].map((n) => window.axio!.adapter.api.getLineThickness(n)))).toEqual([9, 9]);
  await page.evaluate(() => window.axio!.undo());
  expect(await page.evaluate(() => ["PQ", "RS"].map((n) => window.axio!.adapter.api.getLineThickness(n)))).toEqual([4, 6]);
});

test("manual styling covers more than 32 objects in one undo step", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  const original = await page.evaluate(() => {
    const c = window.axio!;
    c.mutate(() => { for (let i = 0; i < 37; i++) c.adapter.command(`P${i}=(${i / 10},${i % 3})`); });
    c.selectMany(c.objects.map((o) => o.name));
    return c.objects.map((o) => ({ name: o.name, color: o.color }));
  });
  await page.getByRole("toolbar", { name: "Thao tác đối tượng" }).getByRole("button", { name: "Thuộc tính", exact: true }).click();
  await page.getByRole("button", { name: "Màu chung #E31665", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.objects.every((o) => o.color === "#E31665"))).toBe(true);
  await page.evaluate(() => window.axio!.undo());
  expect(await page.evaluate(() => window.axio!.objects.map((o) => ({ name: o.name, color: o.color })))).toEqual(original);
});

test("the explorer retains real engine objects outside its familiar categories", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await page.evaluate(() => window.axio!.mutate(() => window.axio!.adapter.command("f(x)=x^2")));
  await expect(page.locator(".explorer").getByText("KHÁC", { exact: true })).toBeVisible();
  await expect(page.locator(".explorer .object-value").filter({ hasText: "f" })).toHaveCount(1);
  await page.getByRole("button", { name: "Ẩn f", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.adapter.api.getVisible("f"))).toBe(false);
});
