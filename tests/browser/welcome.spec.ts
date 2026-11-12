import { seedTriangle } from "../helpers/sample";
import { test, expect } from "../fixtures";
test.use({ showWelcome: true });

test("first visit has an animated welcome; starting preserves the editor and later reloads skip it", async ({
  page,
}) => {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Chào mừng tới Axio" });
  await expect(welcome).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bắt đầu dựng hình" }),
  ).toBeFocused();
  await expect(page.locator(".application")).toHaveAttribute("inert", "");
  await page.locator(".welcome-panel").evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: "axio-test-results/welcome-desktop.png" });
  await page.getByRole("button", { name: "Bắt đầu dựng hình" }).click();
  await expect(welcome).toBeHidden();
  await expect(page.locator(".application")).not.toHaveAttribute("inert", "");
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await seedTriangle(page);
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.reload();
  await expect(welcome).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("A"))).toBe(
    true,
  );
  await page.evaluate(() => sessionStorage.removeItem("axio-welcome-visit-v2"));
  await page.reload();
  await expect(welcome).toBeVisible();
  await page.getByRole("button", { name: "Bỏ qua lời chào" }).click();
  await expect(welcome).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("A"))).toBe(
    true,
  );
});

test("mobile welcome fits, traps keyboard focus and respects reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Bắt đầu dựng hình" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Xem video hướng dẫn ↗" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("checkbox", { name: "Không hiện lại lời chào" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Bỏ qua lời chào" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("checkbox", { name: "Không hiện lại lời chào" }),
  ).toBeFocused();
  expect(
    await page
      .locator(".welcome-screen")
      .evaluate((node) => node.getAnimations({ subtree: true }).length),
  ).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  const start = await page
    .getByRole("button", { name: "Bắt đầu dựng hình" })
    .boundingBox();
  expect(start!.y + start!.height).toBeLessThan(667);
  await page.screenshot({ path: "axio-test-results/welcome-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Chào mừng tới Axio" }),
  ).toBeHidden();
});

test("password reset links open their form without the welcome overlay", async ({
  page,
}) => {
  await page.goto("/?auth=reset&token=test-only-token");
  await expect(
    page.getByRole("dialog", { name: "Chào mừng tới Axio" }),
  ).toBeHidden();
  await expect(page.locator(".auth-dialog")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("axio-welcome-seen-v1")),
  ).toBeNull();
});

test("legacy visitors see the greeting again and can opt out or reopen it through the logo", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("axio-welcome-seen-v1", "1"),
  );
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Chào mừng tới Axio" });
  await expect(welcome).toBeVisible();
  await page.getByRole("checkbox", { name: "Không hiện lại lời chào" }).check();
  await page.getByRole("button", { name: "Bắt đầu dựng hình" }).click();
  await expect(welcome).toBeHidden();
  await page.evaluate(() => sessionStorage.removeItem("axio-welcome-visit-v2"));
  await page.reload();
  await expect(welcome).toBeHidden();
  await page.getByRole("button", { name: "Mở lời chào Axio" }).click();
  await expect(welcome).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Không hiện lại lời chào" })
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();
  await page.evaluate(() => sessionStorage.removeItem("axio-welcome-visit-v2"));
  await page.reload();
  await expect(welcome).toBeVisible();
});
