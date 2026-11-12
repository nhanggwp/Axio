import { test, expect, type Page } from "../fixtures";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
}
async function fits(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  const size = page.viewportSize()!;
  expect(box, selector).not.toBeNull();
  expect(box!.x, selector).toBeGreaterThanOrEqual(-1);
  expect(box!.y, selector).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, selector).toBeLessThanOrEqual(size.width + 1);
  expect(box!.y + box!.height, selector).toBeLessThanOrEqual(size.height + 1);
}
test("header, session chooser, composer and real tools fit phone, tablet, desktop and landscape", async ({
  page,
}, info) => {
  await ready(page);
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [375, 667],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(width);
    await fits(page, ".topbar");
    await fits(page, ".assistant-toggle");
    await page
      .getByRole("button", { name: "Chọn phiên làm việc", exact: true })
      .click();
    await fits(page, ".session-chooser");
    await page
      .getByRole("searchbox", { name: "Tìm phiên làm việc" })
      .fill("Phiên");
    await expect(page.getByRole("tab")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Thao tác khác", exact: true })
      .click();
    await fits(page, ".editor-menu-panel");
    await expect(
      page.getByRole("button", { name: "Xuất ảnh hoặc tệp" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const toggle = page.getByRole("button", { name: "Ẩn / hiện trợ lý AI" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await fits(page, ".assistant");
    await fits(page, ".composer");
    await page
      .getByRole("textbox", { name: "Yêu cầu hình học" })
      .fill("Bản nháp kiểm tra bố cục\nDòng thứ hai");
    await fits(page, ".composer");
    await page.screenshot({
      path: info.outputPath(`editor-${width}x${height}.png`),
    });
    await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
    const canvas = await page.locator(".workspace").boundingBox();
    expect(canvas!.width).toBeGreaterThan(220);
    expect(canvas!.height).toBeGreaterThan(180);
    for (const group of [
      "DI CHUYỂN",
      "ĐIỂM",
      "ĐƯỜNG THẲNG",
      "ĐA GIÁC",
      "ĐƯỜNG TRÒN",
      "DỰNG HÌNH",
      "ĐO LƯỜNG",
      "BIẾN HÌNH",
      "ĐỐI TƯỢNG",
    ]) {
      await page.getByRole("button", { name: group, exact: true }).click();
      await fits(page, ".tool-flyout");
      await page.keyboard.press("Escape");
    }
  }
});
test("compact session selector preserves drawing and drafts; mobile tools actually create geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator(".assistant")).toBeHidden();
  await page.getByRole("button", { name: "ĐA GIÁC", exact: true }).click();
  await page
    .getByRole("button", { name: "Tam giác thường", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.axio!.objects.filter((o) => o.type === "point").length,
      ),
    )
    .toBe(3);
  await page.getByRole("button", { name: "Ẩn / hiện trợ lý AI" }).click();
  const composer = page.getByRole("textbox", { name: "Yêu cầu hình học" });
  await composer.fill("Bản nháp phiên đầu");
  await page
    .getByRole("button", { name: "Tạo phiên mới", exact: true })
    .click();
  await expect(page.locator(".session-current-name")).toHaveText("Phiên 2");
  await page.getByRole("button", { name: "Ẩn / hiện trợ lý AI" }).click();
  await expect(composer).toHaveValue("");
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await page
    .getByRole("button", { name: "Chọn phiên làm việc", exact: true })
    .click();
  await page.getByRole("tab").filter({ hasText: "Phiên 1" }).click();
  await expect(page.locator(".session-current-name")).toHaveText("Phiên 1");
  await page.getByRole("button", { name: "Ẩn / hiện trợ lý AI" }).click();
  await expect(composer).toHaveValue("Bản nháp phiên đầu");
  expect(
    await page.evaluate(
      () => window.axio!.objects.filter((o) => o.type === "point").length,
    ),
  ).toBe(3);
  await page
    .getByRole("button", { name: "Chọn phiên làm việc", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quản lý phiên", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đổi tên phiên Phiên 1", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Tên phiên mới" })
    .fill(
      "Một phiên có tên rất dài để kiểm tra giao diện và bộ chọn phiên trên điện thoại",
    );
  await page
    .getByRole("button", { name: "Lưu tên phiên", exact: true })
    .click();
  await page.getByRole("button", { name: "Đóng quản lý phiên" }).click();
  await fits(page, ".assistant-toggle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".session-current-name")).toContainText(
    "Một phiên có tên rất dài",
  );
  expect(
    await page.evaluate(
      () => window.axio!.objects.filter((o) => o.type === "point").length,
    ),
  ).toBe(3);
});

test("mobile action menu opens real export and save dialogs; composer survives a keyboard-sized viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await ready(page);
  await page.getByRole("button", { name: "ĐA GIÁC", exact: true }).click();
  await page.getByRole("button", { name: "Tam giác thường", exact: true }).click();
  await page.getByRole("button", { name: "Thao tác khác", exact: true }).click();
  await page.getByRole("button", { name: "Xuất ảnh hoặc tệp", exact: true }).click();
  await expect(page.locator(".document-dialog")).toBeVisible();
  await fits(page, ".document-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Thao tác khác", exact: true }).click();
  await page.getByRole("button", { name: "Lưu và mở tài liệu", exact: true }).click();
  await expect(page.locator(".document-dialog")).toBeVisible();
  await fits(page, ".document-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ẩn / hiện trợ lý AI" }).click();
  await expect(page.locator(".composer-wrap")).not.toContainText("DeepSeek");
  await expect(page.locator(".composer-wrap")).not.toContainText("lượt/ngày");
  const composer = page.getByRole("textbox", { name: "Yêu cầu hình học" });
  await composer.fill("Đang gõ tiếng Việt");
  let submitted = 0;
  page.on("request", r => { if (r.url().includes("/api/assist")) submitted++; });
  await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true });
  await expect(composer).toHaveValue("Đang gõ tiếng Việt");
  expect(submitted).toBe(0);
  await page.setViewportSize({ width: 375, height: 430 });
  await fits(page, ".composer");
  await expect(composer).toHaveValue("Đang gõ tiếng Việt");
  await composer.fill("Một dòng nháp cần giữ lại khi bàn phím mở.\n".repeat(15));
  await fits(page, ".composer");
  await fits(page, ".composer button");
  await page.screenshot({ path: info.outputPath("composer-keyboard-size.png") });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
  expect(await page.evaluate(() => window.axio!.objects.filter(o => o.type === "point").length)).toBe(3);
  await page.getByRole("button", { name: "Đối tượng · 7", exact: true }).click();
  await expect(page.locator(".explorer")).toBeVisible();
  await page.getByRole("button", { name: "Ẩn / hiện trợ lý AI" }).click();
  await expect(page.locator(".explorer")).toBeHidden();
  await expect(page.locator(".assistant")).toBeVisible();
  await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
  await page.getByRole("button", { name: "Đối tượng · 7", exact: true }).click();
  await page.locator(".explorer .object-value").first().click();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.locator(".explorer")).toBeHidden();
  await fits(page, ".inspector");
});
