import { test, expect } from "../fixtures";

test("partial replies appear before completion, can be stopped and cannot mutate geometry", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    const state = window as typeof window & { stopped?: boolean };
    let turn = 0;
    window.fetch = async (input, init) => {
      if (String(input) !== "/api/assist") return original(input, init);
      turn++;
      if (turn > 1) return new Response(JSON.stringify({ status: "explanation", message: "Đường tròn ngoại tiếp đi qua ba đỉnh.", suggestions: ["Dựng một tam giác bất kỳ."], actions: [] }), { headers: { "Content-Type": "application/json" } });
      return new Response(new ReadableStream({ start(controller) {
        const send = (event: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: "phase", phase: "generating" });
        send({ type: "text", text: "Đường tròn nội tiếp tiếp xúc" });
        init?.signal?.addEventListener("abort", () => { state.stopped = true; controller.error(new DOMException("Stopped", "AbortError")); });
      } }), { headers: { "Content-Type": "text/event-stream" } });
    };
  });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Nội tiếp là gì?");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByLabel("Phản hồi đang nhận")).toContainText("Đường tròn nội tiếp tiếp xúc");
  await expect(page.getByRole("button", { name: "Tạo phiên mới", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Dừng phản hồi" }).click();
  await expect(page.locator(".processing")).toBeHidden();
  await expect(page.getByRole("button", { name: "Tạo phiên mới", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as typeof window & { stopped?: boolean }).stopped)).toBe(true);
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Còn ngoại tiếp?");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".assistant-message").last()).toContainText("ngoại tiếp đi qua ba đỉnh");
  await expect(page.getByRole("button", { name: "Dựng một tam giác bất kỳ.", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
});

test("chat can explain and revise a pending preview, retaining proposal outcomes", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  let turn = 0;
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/assist", (route) => {
    payloads.push(route.request().postDataJSON());
    turn++;
    return route.fulfill({ json: turn === 2 ? { status: "explanation", message: "Điểm P có tọa độ (1, 2).", actions: [] } : {
      status: "ready_to_preview", message: turn === 1 ? "Đề xuất điểm P." : "Đề xuất điểm P màu tím.", actions: [
        { type: "point", label: "P", x: 1, y: 2 },
        ...(turn > 2 ? [{ type: "style", target: "P", color: "#4F18E9" }] : []),
      ],
    } });
  });
  const send = async (text: string) => {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(text);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
  };
  await send("Dựng điểm P.");
  await send("Giải thích điểm đó.");
  await expect(page.locator(".assistant-message").last()).toContainText("Điểm P có tọa độ");
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("P"))).toBe(false);
  await send("Đổi nó thành tím.");
  await expect(page.locator(".message-outcome.cancelled")).toHaveCount(1);
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("P"))).toBe(false);
  const history = payloads[2].conversation as { content: string; outcome?: string; actions?: unknown[] }[];
  expect(history.find((m) => m.content === "Đề xuất điểm P.")).toMatchObject({ outcome: "previewed", actions: [{ type: "point", label: "P" }] });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.adapter.api.getColor("P"))).toBe("#4F18E9");
  await expect(page.locator(".message-outcome.applied")).toHaveCount(1);
});
