import { test, expect, type Page } from "../fixtures";
import { replySchema, type GeometryCheck } from "../../shared/actions";

const checks: GeometryCheck[] = [
  { kind: "on_segment", refs: ["S", "Q", "R"] },
  { kind: "on_segment", refs: ["T", "R", "P"] },
  { kind: "on_segment", refs: ["U", "P", "Q"] },
  { kind: "equal_distance", refs: ["P", "T", "T", "U"] },
  { kind: "equal_distance", refs: ["Q", "S", "S", "U"] },
  { kind: "dependent", refs: ["S", "T", "U"] },
];
const valid = replySchema.parse({
  status: "ready_to_preview", message: "Chọn U là trung điểm PQ rồi dựng S, T bằng giao với đường trung trực.", checks,
  actions: [
    { type: "construct", kind: "midpoint", label: "U", refs: ["P", "Q"] },
    { type: "construct", kind: "perpendicular_bisector", label: "bisPU", refs: ["P", "U"] },
    { type: "construct", kind: "line", label: "PR", refs: ["P", "R"] },
    { type: "construct", kind: "intersection", label: "T", refs: ["bisPU", "PR"] },
    { type: "construct", kind: "perpendicular_bisector", label: "bisQU", refs: ["Q", "U"] },
    { type: "construct", kind: "line", label: "QR", refs: ["Q", "R"] },
    { type: "construct", kind: "intersection", label: "S", refs: ["bisQU", "QR"] },
  ],
});
const invalid = replySchema.parse({
  ...valid, message: "Đề xuất cần được kiểm tra.",
  actions: [
    { type: "construct", kind: "midpoint", label: "U", refs: ["P", "Q"] },
    { type: "construct", kind: "midpoint", label: "T", refs: ["P", "U"] },
    { type: "construct", kind: "midpoint", label: "S", refs: ["Q", "U"] },
  ],
});
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.evaluate(() => window.axio!.apply([
    { type: "point", label: "P", x: 0, y: 4 },
    { type: "point", label: "Q", x: -3, y: 0 },
    { type: "point", label: "R", x: 3, y: 0 },
  ]));
}
test("constraint failure rolls back a native construction and repair uses actual feedback", async ({ page }) => {
  await ready(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/assist", (route) => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill({ json: payloads.length === 1 ? invalid : valid });
  });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Lấy S trên QR, T trên RP, U trên PQ sao cho PT=TU, QS=SU.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 30000 });
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toMatchObject({ request: payloads[0].request, validation_feedback: { previous: { checks }, message: expect.stringContaining("S không nằm trên đoạn QR") } });
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("S"))).toBe(false);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  for (const x of [0.15, 0.4]) {
    await page.evaluate(({ x, checks }) => {
      const c = window.axio!;
      c.adapter.api.setCoords("P", x, 4.12);
      c.apply([], checks);
    }, { x, checks });
  }
  await expect(page.locator(".message-outcome.execution_error")).toHaveCount(1);
  await expect(page.locator(".message-outcome.applied")).toHaveCount(1);
});
test("failed checks cannot be applied and automatic repair is bounded", async ({ page }) => {
  await ready(page);
  let requests = 0;
  await page.route("**/api/assist", (route) => { requests++; return route.fulfill({ json: invalid }); });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Dựng cấu hình theo các quan hệ đã cho.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".error-card")).toContainText("không nằm trên đoạn", { timeout: 30000 });
  expect(requests).toBe(3);
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeHidden();
  expect(await page.evaluate(() => window.axio!.adapter.api.getAllObjectNames())).toEqual(["P", "Q", "R"]);
});
test("preview rejects equal lengths that only coincide at the initial special triangle", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.axio!.adapter.api.setCoords("P", 0, Math.sqrt(27)));
  const coincidence = replySchema.parse({ ...valid, actions: [
    { type: "construct", kind: "midpoint", label: "U", refs: ["P", "Q"] },
    { type: "construct", kind: "midpoint", label: "T", refs: ["P", "R"] },
    { type: "construct", kind: "midpoint", label: "S", refs: ["Q", "R"] },
  ] });
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/assist", (route) => { payloads.push(route.request().postDataJSON()); return route.fulfill({ json: payloads.length === 1 ? coincidence : valid }); });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Dựng các quan hệ bằng nhau và giữ khi kéo đỉnh.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 30000 });
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toMatchObject({ validation_feedback: { message: expect.stringContaining("Ràng buộc mất khi thử di chuyển") } });
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("S"))).toBe(false);
  expect(await page.evaluate(() => window.axio!.adapter.api.getYcoord("P"))).toBeCloseTo(Math.sqrt(27), 10);
});
test("apply rechecks constraints and restores the previous source on failure", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate((plan) => {
    const c = window.axio!, before = c.adapter.snapshot();
    try { c.apply(plan.actions, plan.checks); return { error: "", unchanged: false }; }
    catch (e) { return { error: String(e), unchanged: c.adapter.snapshot() === before }; }
  }, invalid);
  expect(result.error).toContain("không nằm trên đoạn");
  expect(result.unchanged).toBe(true);
});
test("native reflection, circle incidence and perpendicular checks survive moving a source vertex", async ({ page }) => {
  await ready(page);
  const full = replySchema.parse({ ...valid, actions: [...valid.actions,
    { type: "construct", kind: "line", label: "ST", refs: ["S", "T"] },
    { type: "construct", kind: "reflect", label: "V", refs: ["U", "ST"] },
    { type: "construct", kind: "circumcircle", label: "cPQR", refs: ["P", "Q", "R"] },
    { type: "construct", kind: "circumcircle", label: "cRST", refs: ["R", "S", "T"] },
    { type: "construct", kind: "center", label: "O1", refs: ["cPQR"] },
    { type: "construct", kind: "center", label: "O2", refs: ["cRST"] },
    { type: "construct", kind: "line", label: "OO", refs: ["O1", "O2"] },
    { type: "construct", kind: "line", label: "RV", refs: ["R", "V"] },
  ], checks: [...checks,
    { kind: "reflection", refs: ["V", "U", "ST"] },
    ...["P", "Q", "R"].map((name) => ({ kind: "on_circle", refs: [name, "cPQR"] })),
    ...["R", "S", "T"].map((name) => ({ kind: "on_circle", refs: [name, "cRST"] })),
    { kind: "perpendicular", refs: ["OO", "RV"] },
  ] });
  await page.evaluate((plan) => {
    const c = window.axio!;
    c.apply(plan.actions, plan.checks);
    c.adapter.api.setCoords("P", 0.15, 4.12);
    c.apply([], plan.checks);
  }, full);
});
test("intersection selects one named branch instead of silently producing suffixed points", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const c = window.axio!;
    c.apply([
      { type: "construct", kind: "circle_radius", label: "circleP", refs: ["P"], value: 2 },
      { type: "construct", kind: "line", label: "linePQ", refs: ["P", "Q"] },
      { type: "construct", kind: "intersection", label: "I", refs: ["circleP", "linePQ"] },
      { type: "construct", kind: "intersection", label: "J", refs: ["circleP", "linePQ"], value: 2 },
    ], [{ kind: "on_circle", refs: ["I", "circleP"] }, { kind: "on_circle", refs: ["J", "circleP"] }]);
  });
  expect(await page.evaluate(() => {
    const api = window.axio!.adapter.api;
    return Math.hypot(api.getXcoord("I") - api.getXcoord("J"), api.getYcoord("I") - api.getYcoord("J"));
  })).toBeCloseTo(4, 10);
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("I_1"))).toBe(false);
});
