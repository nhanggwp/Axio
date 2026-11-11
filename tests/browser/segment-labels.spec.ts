import { test, expect, type Page } from "../fixtures";

async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
}
test("native polygon edges hide measurements until requested and retain dynamic endpoint captions", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const api = window.axio!.adapter.api;
    api.evalCommand("A=(0,0)\nB=(3,0)\nC=(0,5)\ntri=Polygon(A,B,C)");
  });
  const ac = page.locator(".explorer").getByRole("button", { name: "AC 5", exact: true });
  await expect(ac).toBeVisible();
  const id = await page.evaluate(() => window.axio!.objects.find((o) => o.type === "segment" && o.displayName === "AC")!.name);
  expect(id).not.toBe("AC");
  expect(await page.evaluate(name => window.axio!.objects.find(o => o.name === name)!.labelVisible,id)).toBe(false);
  await page.getByRole("button", {name:"Ẩn / hiện số đo",exact:true}).click();
  expect(await page.evaluate((name) => { const api = window.axio!.adapter.api; return { caption: api.getCaption(name, true), style: api.getLabelStyle(name), visible: window.axio!.objects.find((o) => o.name === name)!.labelVisible }; }, id)).toEqual({ caption: "AC = 5", style: 3, visible: true });
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "C", x: 0, y: 7 }]));
  await expect(page.locator(".explorer").getByRole("button", { name: "AC 7", exact: true })).toBeVisible();
  expect(await page.evaluate((name) => window.axio!.adapter.api.getCaption(name, true), id)).toBe("AC = 7");
  await page.evaluate(() => window.axio!.mutate(() => { window.axio!.adapter.api.renameObject("C", "D"); }));
  expect(await page.evaluate((name) => window.axio!.adapter.api.getCaption(name, true), id)).toBe("AD = 7");
  await page.evaluate(() => window.axio!.undo());
  expect(await page.evaluate((name) => window.axio!.adapter.api.getCaption(name, true), id)).toBe("AC = 7");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("tab", { name: "Phiên 1", exact: true }).click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await expect(page.locator(".explorer").getByRole("button", { name: "AC 7", exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/segment-endpoint-labels.png" });
});

test("AI preview/apply uses endpoint captions and sends the display-to-ID mapping to the planner", async ({ page }) => {
  await ready(page);
  const payloads: { objects: { name: string; displayName?: string }[] }[] = [];
  let turn = 0;
  await page.route("**/api/assist", (route) => {
    const payload = route.request().postDataJSON(); payloads.push(payload); turn++;
    return route.fulfill({ json: turn === 1 ? {
      status: "ready_to_preview", message: "Đề xuất tam giác.", actions: [
        { type: "point", label: "A", x: 0, y: 0 }, { type: "point", label: "B", x: 3, y: 0 }, { type: "point", label: "C", x: 0, y: 5 },
        { type: "construct", kind: "polygon", label: "tri", refs: ["A", "B", "C"] },
      ],
    } : { status: "explanation", message: "Đã nhận đúng cạnh AC.", actions: [] } });
  });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Vẽ tam giác ABC.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(page.locator(".explorer").getByRole("button", { name: "AC 5", exact: true })).toBeVisible();
  const id = await page.evaluate(() => window.axio!.objects.find((o) => o.displayName === "AC")!.name);
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Giải thích cạnh AC.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".conversation")).toContainText("Đã nhận đúng cạnh AC.");
  expect(payloads[1].objects).toContainEqual(expect.objectContaining({ name: id, displayName: "AC" }));
  await page.evaluate((name) => {
    const c = window.axio!;
    const legacy = c.adapter.snapshot().replace(/<caption[^>]*\/>/g, "").replace(/<labelMode val="3"/g, '<labelMode val="1"');
    c.mutate(() => c.adapter.restore(legacy));
    c.adapter.api.setLabelVisible(name, false);
    c.sync();
  }, id);
  expect(await page.evaluate((name) => { const c = window.axio!; return { caption: c.adapter.api.getCaption(name, true), visible: c.objects.find((o) => o.name === name)!.labelVisible }; }, id)).toEqual({ caption: "AC = 5", visible: false });
});
