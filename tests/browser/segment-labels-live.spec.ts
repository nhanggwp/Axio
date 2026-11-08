import { writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures";
import { completedAgentReply, observeAgent } from "../helpers/agent";

test("live agent resolves a visible endpoint label to the existing native segment", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(180000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.evaluate(() => window.axio!.apply([
    { type: "point", label: "A", x: 0, y: 0 }, { type: "point", label: "B", x: 3, y: 0 }, { type: "point", label: "C", x: 0, y: 5 },
    { type: "construct", kind: "polygon", label: "tri", refs: ["A", "B", "C"] },
  ]));
  const before = await page.evaluate(() => window.axio!.objects);
  const segment = before.find((o) => o.type === "segment" && o.displayName === "AC")!;
  expect(segment.name).not.toBe("AC");
  await observeAgent(page);
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Đổi cạnh AC sang màu tím #4F18E9.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  const { plan } = await completedAgentReply(page, 0);
  expect(plan.status, plan.message).toBe("ready_to_preview");
  expect(plan.actions).toContainEqual({ type: "style", target: segment.name, color: "#4F18E9" });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(before.length);
  expect(await page.evaluate((name) => ({ caption: window.axio!.adapter.api.getCaption(name, true), color: window.axio!.adapter.api.getColor(name) }), segment.name)).toEqual({ caption: "AC = 5", color: "#4F18E9" });
  await writeFile("docs/segment-labels-live-response.json", JSON.stringify({ plan }, null, 2));
  await page.screenshot({ path: "docs/segment-labels-live.png" });
});
