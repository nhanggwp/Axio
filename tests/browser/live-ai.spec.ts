import { test, expect } from "../fixtures";
import { observeAgent, completedAgentReply } from "../helpers/agent";

test("live DeepSeek: unconstrained new shapes preview without demanding existing vertices", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_LIVE_AI !== "1",
    "Enable explicitly; uses paid DeepSeek API.",
  );
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await observeAgent(page);
  let turn = 0;
  const triangle = async (request: string) => {
    const before = await page.evaluate(() => window.axio!.objects);
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(request);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const { plan, nextIndex } = await completedAgentReply(page, turn);
    turn = nextIndex;
    expect(plan.status, plan.message).toBe("ready_to_preview");
    expect(plan.pending).toBeNull();
    expect(plan.selection_request).toBeNull();
    const points = plan.actions.filter((a) => a.type === "point");
    expect(points).toHaveLength(3);
    const polygon = plan.actions.find(
      (a) => a.type === "construct" && a.kind === "polygon",
    );
    expect(polygon?.type).toBe("construct");
    if (polygon?.type !== "construct") throw new Error("Missing polygon");
    expect(polygon.refs).toHaveLength(3);
    expect(polygon.refs.every((n) => points.some((p) => p.label === n))).toBe(
      true,
    );
    await expect(
      page.getByRole("button", { name: "Áp dụng", exact: true }),
    ).toBeEnabled({ timeout: 20000 });
    // The real temporary applet validates the proposal; the source stays untouched.
    expect(await page.evaluate(() => window.axio!.objects)).toEqual(before);
    await expect(page.locator(".clarification")).toBeHidden();
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    expect(
      await page.evaluate(
        (name) => window.axio!.adapter.api.getValue(name),
        polygon.label,
      ),
    ).toBeGreaterThan(0);
    const after = await page.evaluate(() => window.axio!.objects);
    for (const object of before)
      expect(after.find((o) => o.name === object.name)).toEqual(object);
    return { plan, points };
  };
  await triangle("dựng cho tui 1 hình tam giác đi");
  await triangle("Thêm cho mình một tam giác nữa, không dùng lại các đỉnh đã có.");
  await page.screenshot({ path: "docs/agent-free-triangles.png" });
});

test("live DeepSeek: triangle, altitude, circumcircle, style, ambiguity", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_LIVE_AI !== "1",
    "Enable explicitly; uses paid DeepSeek API.",
  );
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Hình dựng mới", exact: true })
    .click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await observeAgent(page);
  let turn = 0;
  const request = async (text: string) => {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(text);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const { plan, nextIndex } = await completedAgentReply(page, turn);
    turn = nextIndex;
    expect(plan.status, plan.message).toBe("ready_to_preview");
    await expect(
      page.getByRole("button", { name: "Áp dụng", exact: true }),
    ).toBeEnabled({ timeout: 65000 });
    expect(await page.locator(".error-card").count()).toBe(0);
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  };
  await request("Vẽ tam giác ABC vuông tại A, AB = 3, AC = 4.");
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("BC")),
  ).toBeCloseTo(5);
  const objects = await page.evaluate(() =>
    window.axio!.adapter.api.getAllObjectNames(),
  );
  await request(
    "Dựng đường cao từ A trong tam giác hiện tại. Gọi chân là H và đường cao là AH.",
  );
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("AH")),
  ).toBeCloseTo(2.4);
  for (const name of objects)
    expect(
      await page.evaluate((n) => window.axio!.adapter.api.exists(n), name),
    ).toBe(true);
  await request("Vẽ đường tròn ngoại tiếp tam giác ABC. Đặt tên là cABC.");
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getObjectType("cABC")),
  ).toBe("circle");
  await page.evaluate(() => window.axio!.apply([{ type: "style", target: "AH", color: "#23232D" }]));
  await request("Đổi đường cao AH thành màu tím #4F18E9.");
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getColor("AH")),
  ).toBe("#4F18E9");
  const count = await page.evaluate(() => window.axio!.objects.length);
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Cho đường này vuông góc.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByText(/Cần làm rõ yêu cầu/)).toBeVisible({
    timeout: 65000,
  });
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(count);
  await page.screenshot({ path: "docs/live-ai.png" });
});

test("live conversational geometry: incircle, circumcircle, explanation and contextual recolor", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(240000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await observeAgent(page);
  let turn = 0;
  const ask = async (text: string, apply: boolean) => {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(text);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const { plan, chunks, nextIndex } = await completedAgentReply(page, turn);
    turn = nextIndex;
    expect(chunks).toBeGreaterThan(0);
    if (apply) {
      expect(plan.status, plan.message).toBe("ready_to_preview");
      await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
      await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    } else expect(plan.status, plan.message).toBe("explanation");
    return plan;
  };
  await ask("Vẽ tam giác ABC vuông tại A, AB = 6, AC = 8.", true);
  const circles = await ask("vẽ đường tròn nội tiếp và ngoại tiếp tam giác này luôn đi", true);
  const inside = circles.actions.find((a) => a.type === "construct" && a.kind === "incircle");
  const outside = circles.actions.find((a) => a.type === "construct" && a.kind === "circumcircle");
  expect(inside?.type).toBe("construct"); expect(outside?.type).toBe("construct");
  if (inside?.type !== "construct" || outside?.type !== "construct") throw new Error("Missing triangle circles");
  for (const name of [inside.label, outside.label]) expect(await page.evaluate((n) => window.axio!.adapter.api.getObjectType(n), name)).toBe("circle");
  const count = await page.evaluate(() => window.axio!.objects.length);
  const explanation = await ask("hai cái đó khác nhau sao?", false);
  expect(explanation.message).toMatch(/nội tiếp/i); expect(explanation.message).toMatch(/ngoại tiếp/i);
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(count);
  const styled = await ask("đổi cái nội tiếp sang màu tím #4F18E9 nha", true);
  expect(styled.actions).toContainEqual({ type: "style", target: inside.label, color: "#4F18E9" });
  expect(await page.evaluate((n) => window.axio!.adapter.api.getColor(n), inside.label)).toBe("#4F18E9");
  await page.evaluate(() => window.axio!.adapter.resetView());
  await page.screenshot({ path: "docs/agent-conversational-circles.png" });
});

test("live circle intent follows semantic permission and asks only for an unspecified center", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(180000);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await observeAgent(page);
  let turn = 0;
  const ask = async (text: string) => {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(text);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const { plan, nextIndex } = await completedAgentReply(page, turn);
    turn = nextIndex;
    return plan;
  };
  const free = await ask("Vẽ đường tròn bán kính 5, tự chọn vị trí cho hợp lý.");
  expect(free.status, free.message).toBe("ready_to_preview");
  expect(free.source).toBe("deepseek");
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await page.evaluate(() => window.axio!.newDocument());
  const missing = await ask("Vẽ đường tròn bán kính 5.");
  expect(missing.status, missing.message).toBe("needs_clarification");
  expect(missing.source).toBe("deepseek");
  expect(missing.actions).toEqual([]);
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  const answer = await ask("Tự chọn tâm giúp mình nhé.");
  expect(answer.status, answer.message).toBe("ready_to_preview");
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  const radius = await page.evaluate(() => {
    const api = window.axio!.adapter.api;
    const circle = api.getAllObjectNames().find((n) => api.getObjectType(n) === "circle")!;
    api.evalCommand(`testRadius=Radius(${circle})`);
    return api.getValue("testRadius");
  });
  expect(radius).toBeCloseTo(5);
});
