import { copyFile, writeFile } from "node:fs/promises";
import { test, expect, type Page } from "../fixtures";
import { observeAgent, agentReply } from "../helpers/agent";

const problem = "Cho tam giác ABC, trên BC, CA, AB thứ tự lấy các điểm M, N, E sao cho AN = NE, BM = ME. Gọi D là điểm đối xứng của E qua MN. Chứng minh rằng đường thẳng nối tâm hai đường tròn ngoại tiếp tam giác ABC và tam giác CMN vuông góc với CD.";

async function inspect(page: Page) {
  return page.evaluate(() => {
    const api = window.axio!.adapter.api, objects = window.axio!.adapter.objects();
    const point = (name: string) => ({ x: api.getXcoord(name), y: api.getYcoord(name) });
    const points = Object.fromEntries(["A", "B", "C", "M", "N", "E", "D"].map((name) => [name, point(name)]));
    const doc = new DOMParser().parseFromString(api.getXML(), "application/xml");
    const circles = objects.filter((o) => o.type === "circle").map((o) => {
      const matrix = [...doc.querySelectorAll("construction > element")].find((e) => e.getAttribute("label") === o.name)!.querySelector("matrix")!;
      const a = Number(matrix.getAttribute("A0"));
      const x = -Number(matrix.getAttribute("A4")) / a, y = -Number(matrix.getAttribute("A5")) / a;
      return { name: o.name, x, y, r2: x * x + y * y - Number(matrix.getAttribute("A2")) / a };
    });
    const lines = objects.filter((o) => ["line", "segment"].includes(o.type)).map((o) => {
      const coords = [...doc.querySelectorAll("construction > element")].find((e) => e.getAttribute("label") === o.name)!.querySelector("coords")!;
      return { name: o.name, a: Number(coords.getAttribute("x")), b: Number(coords.getAttribute("y")), c: Number(coords.getAttribute("z")) };
    });
    return { points, circles, lines, objects, defined: ["A", "B", "C", "M", "N", "E", "D"].every((n) => api.exists(n) && api.isDefined(n)) };
  });
}

function verify(figure: Awaited<ReturnType<typeof inspect>>) {
  expect(figure.defined, "All named points must be defined").toBe(true);
  const { A, B, C, M, N, E, D } = figure.points;
  type Point = typeof A;
  const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  const onSegment = (p: Point, a: Point, b: Point) => {
    expect(Math.abs(distance(a, p) + distance(p, b) - distance(a, b))).toBeLessThan(1e-7);
    expect(Math.min(distance(a, p), distance(p, b))).toBeGreaterThan(1e-5);
  };
  onSegment(M, B, C); onSegment(N, C, A); onSegment(E, A, B);
  expect(Math.abs(distance(A, N) - distance(N, E)), "AN = NE").toBeLessThan(1e-7);
  expect(Math.abs(distance(B, M) - distance(M, E)), "BM = ME").toBeLessThan(1e-7);
  const dx = N.x - M.x, dy = N.y - M.y;
  const t = ((E.x - M.x) * dx + (E.y - M.y) * dy) / (dx * dx + dy * dy);
  expect(distance(D, { x: 2 * (M.x + t * dx) - E.x, y: 2 * (M.y + t * dy) - E.y }), "D is E reflected in MN").toBeLessThan(1e-7);
  const circleThrough = (vertices: Point[]) => figure.circles.find((c) => vertices.every((p) => Math.abs((p.x - c.x) ** 2 + (p.y - c.y) ** 2 - c.r2) < 1e-7));
  const first = circleThrough([A, B, C]), second = circleThrough([C, M, N]);
  expect(first, "Circumcircle ABC must be drawn").toBeDefined(); expect(second, "Circumcircle CMN must be drawn").toBeDefined();
  if (!first || !second) throw new Error("Missing circumcircles");
  for (const center of [first, second]) expect(figure.objects.some((o) => o.type === "point" && o.x != null && o.y != null && distance({ x: o.x, y: o.y }, center) < 1e-7), "Both centers must be drawn").toBe(true);
  const through = (p: Point, q: Point) => figure.lines.some((l) => Math.abs(l.a * p.x + l.b * p.y + l.c) / Math.hypot(l.a, l.b) < 1e-7 && Math.abs(l.a * q.x + l.b * q.y + l.c) / Math.hypot(l.a, l.b) < 1e-7);
  expect(through(first, second), "Line joining the centers must be drawn").toBe(true);
  expect(through(C, D), "CD must be drawn").toBe(true);
  const dot = (second.x - first.x) * (D.x - C.x) + (second.y - first.y) * (D.y - C.y);
  const cosine = dot / (distance(first, second) * distance(C, D));
  expect(Math.abs(cosine), "Center line perpendicular to CD").toBeLessThan(1e-7);
  return { AN: distance(A, N), NE: distance(N, E), BM: distance(B, M), ME: distance(M, E), perpendicularCosine: cosine };
}

test("live supplied geometry problem: constrained points, reflection and two circumcircles", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await observeAgent(page);
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(`Hãy vẽ đầy đủ hình cho bài sau, gồm mọi đối tượng trong giả thiết và kết luận (chưa cần chứng minh): ${problem}`);
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await agentReply(page, 0);
  await expect(page.locator(".processing")).toBeHidden({ timeout: 200000 });
  const count = await page.evaluate(() => (window as typeof window & { agentStreams: string[] }).agentStreams.length);
  const replies = [];
  for (let i = 0; i < count; i++) replies.push((await agentReply(page, i)).plan);
  const plan = replies.at(-1)!;
  await writeFile("docs/problem-figure-latest-response.json", JSON.stringify({ request: problem, replies }, null, 2));
  expect(plan.source).toBe("deepseek");
  expect(plan.status, plan.message).toBe("ready_to_preview");
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const original = await inspect(page);
  await writeFile("docs/problem-figure-latest-measurements.json", JSON.stringify(original, null, 2));
  await page.screenshot({ path: "docs/problem-figure-latest.png" });
  const metrics = verify(original);
  const data = await page.evaluate(() => window.axio!.adapter.base64());
  await page.evaluate(({ x, y }) => window.axio!.adapter.api.setCoords("A", x + 0.15, y + 0.12), original.points.A);
  const moved = await inspect(page);
  const dynamicMetrics = verify(moved);
  await writeFile("docs/problem-figure-verified-response.json", JSON.stringify({ request: problem, replies }, null, 2));
  await writeFile("docs/problem-figure-verified.ggb", Buffer.from(data, "base64"));
  await copyFile("docs/problem-figure-latest.png", "docs/problem-figure-verified.png");
  await writeFile("docs/problem-figure-verified-measurements.json", JSON.stringify({ original, metrics, moved, dynamicMetrics }, null, 2));
});
