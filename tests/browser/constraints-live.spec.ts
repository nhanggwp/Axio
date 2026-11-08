import { writeFile } from "node:fs/promises";
import { test, expect, type Page } from "../fixtures";
import { agentReply, observeAgent } from "../helpers/agent";
import type { AIReply } from "../../shared/actions";

async function measure(page: Page, names: string[]) {
  return page.evaluate(([a, b, c, m, n, e]) => {
    const api = window.axio!.adapter.api;
    const point = (name: string) => ({ x: api.getXcoord(name), y: api.getYcoord(name) });
    const [A, B, C, M, N, E] = [a, b, c, m, n, e].map(point);
    const d = (p: typeof A, q: typeof A) => Math.hypot(p.x - q.x, p.y - q.y);
    return {
      AN: d(A, N), NE: d(N, E), BM: d(B, M), ME: d(M, E),
      onSides: [d(B, M) + d(M, C) - d(B, C), d(C, N) + d(N, A) - d(C, A), d(A, E) + d(E, B) - d(A, B)],
      dependent: [m, n, e].every((name) => !api.isIndependent(name)),
    };
  }, names);
}
for (const existing of [true, false]) test(`live nonunique constrained construction proceeds without extra assumptions (${existing ? "existing ABC" : "new PQR"})`, async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  if (existing) await page.evaluate(() => window.axio!.apply([
    { type: "point", label: "A", x: 0, y: 4 }, { type: "point", label: "B", x: -3, y: 0 }, { type: "point", label: "C", x: 3, y: 0 },
    { type: "construct", kind: "polygon", label: "tri", refs: ["A", "B", "C"] },
  ]));
  const original = await page.evaluate(() => window.axio!.objects);
  const request = existing
    ? "Vẽ tam giác ABC trên BC, CA, AB thứ tự lấy các điểm M,N, E sao cho AN = NE, BM = ME"
    : "Vẽ tam giác PQR, trên QR, RP, PQ thứ tự lấy S, T, U sao cho PT = TU, QS = SU.";
  if (existing) {
    // Reproduce the old unnecessary question; the following response is live.
    await page.route("**/api/assist", (route) => route.fulfill({ json: {
      status: "needs_clarification", message: "Các điểm chưa xác định duy nhất. Bạn muốn thêm ràng buộc nào?", missing_parameters: ["free_position"],
      pending: { id: "old-nonunique-question", original_request: request, intent: "construct_points_on_sides", resolved: { triangle: "tri" }, missing_parameters: ["free_position"], selection_request: null, step: 1 }, actions: [],
    } }), { times: 1 });
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(request);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.locator(".clarification")).toContainText("chưa xác định duy nhất");
  }
  await observeAgent(page);
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(request);
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await agentReply(page, 0);
  await expect(page.locator(".processing")).toBeHidden({ timeout: 200000 });
  const count = await page.evaluate(() => (window as typeof window & { agentStreams: string[] }).agentStreams.length);
  const replies: AIReply[] = [];
  for (let i = 0; i < count; i++) replies.push((await agentReply(page, i)).plan);
  await writeFile(`docs/constraints-${existing ? "existing" : "new"}-replies.json`, JSON.stringify({ request, replies }, null, 2));
  const last = replies.at(-1)!;
  expect(last.status, last.message).toBe("ready_to_preview");
  expect(last.checks.filter((c) => c.kind === "on_segment")).toHaveLength(3);
  expect(last.checks.filter((c) => c.kind === "equal_distance")).toHaveLength(2);
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.axio!.objects)).toEqual(original);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const names = existing ? ["A", "B", "C", "M", "N", "E"] : ["P", "Q", "R", "S", "T", "U"];
  const first = await measure(page, names);
  for (const result of [first, await (async () => {
    await page.evaluate((a) => { const api = window.axio!.adapter.api; api.setCoords(a, api.getXcoord(a) + 0.15, api.getYcoord(a) + 0.12); }, names[0]);
    return measure(page, names);
  })()]) {
    for (const value of result.onSides) expect(Math.abs(value)).toBeLessThan(1e-7);
    expect(Math.abs(result.AN - result.NE)).toBeLessThan(1e-7);
    expect(Math.abs(result.BM - result.ME)).toBeLessThan(1e-7);
    expect(result.dependent).toBe(true);
  }
  await writeFile(`docs/constraints-${existing ? "existing" : "new"}-measurements.json`, JSON.stringify({ first, afterMove: await measure(page, names) }, null, 2));
  await page.screenshot({ path: `docs/constraints-${existing ? "existing" : "new"}.png` });
});
