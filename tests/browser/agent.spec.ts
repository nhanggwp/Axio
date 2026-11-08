import { test, expect } from "../fixtures";
test("selection continues the same pending perpendicular intent across two clarification steps", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Dựng ví dụ tam giác", exact: true })
    .click();
  let turn = 0;
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/assist", async (route) => {
    const body = route.request().postDataJSON();
    payloads.push(body);
    turn++;
    const pending = {
      id: "pending-perpendicular",
      original_request: "Vẽ đường thẳng vuông góc với đường này.",
      intent: "perpendicular",
      resolved: turn === 1 ? {} : { reference_line: "AB" },
      missing_parameters: turn === 1 ? ["reference_line"] : ["through_point"],
      step: turn,
      selection_request: {
        allowed_types: turn === 1 ? ["segment", "line", "ray"] : ["point"],
        min: 1,
        max: 1,
      },
    };
    await route.fulfill({
      json:
        turn < 3
          ? {
              status: "needs_clarification",
              message:
                turn === 1
                  ? "Bạn muốn đường mới vuông góc với đường nào?"
                  : "Đường mới đi qua điểm nào?",
              missing_parameters: pending.missing_parameters,
              selection_request: pending.selection_request,
              pending,
              actions: [],
            }
          : {
              status: "ready_to_preview",
              message: "Dựng đường qua C vuông góc AB.",
              actions: [
                {
                  type: "construct",
                  kind: "perpendicular",
                  label: "perpC",
                  refs: ["C", "AB"],
                },
              ],
            },
    });
  });
  const before = await page.evaluate(() => window.axio!.objects.length);
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Vẽ đường thẳng vuông góc với đường này.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByText(/Cần làm rõ yêu cầu · bước 1/)).toBeVisible();
  await expect(page.locator(".clarification")).toContainText(
    "Bạn muốn đường mới vuông góc với đường nào?",
  );
  await expect(page.locator(".clarification")).toContainText(
    "Yêu cầu đang chờ: Vẽ đường thẳng vuông góc với đường này.",
  );
  await expect(page.locator(".clarification")).toContainText(
    "Chọn đối tượng phù hợp trên vùng vẽ hoặc danh sách.",
  );
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(before);
  await page
    .locator(".explorer")
    .getByRole("button", { name: "AB 3", exact: true })
    .click();
  await expect(page.getByText(/Cần làm rõ yêu cầu · bước 2/)).toBeVisible();
  await expect(page.locator(".clarification")).toContainText(
    "Đường mới đi qua điểm nào?",
  );
  expect(payloads[1].pending).toMatchObject({
    id: "pending-perpendicular",
    original_request: "Vẽ đường thẳng vuông góc với đường này.",
  });
  await page
    .locator(".explorer")
    .getByRole("button", { name: "C (0, 4)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  expect(payloads[2].pending).toMatchObject({
    resolved: { reference_line: "AB" },
    missing_parameters: ["through_point"],
  });
  expect(
    await page.evaluate(() => window.axio!.adapter.api.exists("perpC")),
  ).toBe(false);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect(
    await page.evaluate(() => window.axio!.adapter.api.exists("perpC")),
  ).toBe(true);
  await expect(page.getByText(/Đã áp dụng thay đổi và kiểm tra/)).toBeVisible();
  await page.screenshot({ path: "docs/upgrade-agent-continuation.png" });
});

test("clarification shows its question and a usable next step on an empty canvas", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      json: {
        status: "needs_clarification",
        message: "Bạn muốn đặt tâm đường tròn ở đâu?",
        missing_parameters: ["center"],
        selection_request: { allowed_types: ["point"], min: 1, max: 1 },
        pending: {
          id: "circle-center",
          original_request: "Vẽ đường tròn bán kính 5.",
          intent: "circle_radius",
          resolved: { radius: "5" },
          missing_parameters: ["center"],
          selection_request: { allowed_types: ["point"], min: 1, max: 1 },
          step: 1,
        },
        actions: [],
      },
    }),
  );
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Vẽ đường tròn bán kính 5.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".clarification")).toContainText(
    "Bạn muốn đặt tâm đường tròn ở đâu?",
  );
  await expect(page.locator(".clarification")).toContainText(
    "Nhập thông tin còn thiếu",
  );
  await expect(page.locator(".clarification")).not.toContainText(
    "Chọn đối tượng phù hợp trên vùng vẽ hoặc danh sách.",
  );
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
});
test("explanation and impossible states never execute geometry", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  let status = "explanation";
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      json: {
        status,
        message:
          status === "explanation"
            ? "Đường trung trực đi qua trung điểm và vuông góc với đoạn thẳng."
            : "Ba cạnh 1, 2, 5 không thể tạo thành tam giác.",
        actions: [],
      },
    }),
  );
  for (const text of [
    "Đường trung trực là gì?",
    "Vẽ tam giác có ba cạnh 1, 2, 5.",
  ]) {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(text);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.locator(".processing")).toBeHidden();
    expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
    await expect(
      page.getByRole("button", { name: "Áp dụng", exact: true }),
    ).toBeHidden();
    status = "impossible";
  }
});

test("invalid preview is reported by the real engine without committing partial actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      json: {
        status: "ready_to_preview",
        message: "Đề xuất đường tròn qua ba điểm.",
        actions: [
          { type: "point", label: "P", x: 0, y: 0 },
          { type: "point", label: "Q", x: 1, y: 0 },
          { type: "point", label: "R", x: 2, y: 0 },
          {
            type: "construct",
            label: "bad",
            kind: "circumcircle",
            refs: ["P", "Q", "R"],
          },
        ],
      },
    }),
  );
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Dựng đường tròn theo yêu cầu.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".assistant .error-card")).toContainText(
    "thẳng hàng",
    { timeout: 15000 },
  );
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeHidden();
});
