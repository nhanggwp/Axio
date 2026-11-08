import { writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures";
import { completedAgentReply, observeAgent } from "../helpers/agent";

test("live right triangle with altitude shows only requested geometry, while an explicitly requested circle stays visible", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(300000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await observeAgent(page);
  let next = 0;
  const ask = async (text: string) => {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(text);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const reply = await completedAgentReply(page, next); next = reply.nextIndex;
    expect(reply.plan.status, reply.plan.message).toBe("ready_to_preview");
    await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    return reply.plan;
  };
  const triangle = await ask("Vẽ tam giác ABC vuông tại A, đường cao AH biết AB=9 cm, AC=12 cm.");
  const geometry = await page.evaluate(() => {
    const c = window.axio!, api = c.adapter.api;
    const distance = (a: string, b: string) => Math.hypot(api.getXcoord(a) - api.getXcoord(b), api.getYcoord(a) - api.getYcoord(b));
    return { AB: distance("A", "B"), AC: distance("A", "C"), AH: distance("A", "H"), circles: c.objects.filter((o) => o.type === "circle" && o.visible).length, points: c.objects.filter((o) => o.type === "point" && o.visible).map((o) => o.name).sort() };
  });
  expect(geometry.AB).toBeCloseTo(9); expect(geometry.AC).toBeCloseTo(12); expect(geometry.AH).toBeCloseTo(7.2);
  expect(geometry.circles).toBe(0);
  expect(geometry.points).toEqual(["A", "B", "C", "H"]);
  await page.screenshot({ path: "docs/triangle-without-construction-circles-live.png" });
  const circle = await ask("Vẽ thêm đường tròn ngoại tiếp tam giác ABC.");
  expect(await page.evaluate(() => window.axio!.objects.filter((o) => o.type === "circle" && o.visible).length)).toBe(1);
  await writeFile("docs/auxiliary-live-response.json", JSON.stringify({ triangle, geometry, circle }, null, 2));
});
