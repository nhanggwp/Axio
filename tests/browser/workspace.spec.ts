import { seedTriangle } from "../helpers/sample";
import { test, expect } from "../fixtures";
import { verifiedAccount, origin, password } from "../helpers/auth";
test("guest geometry survives login; account documents autosave, reload, rename and delete", async ({
  page,
  request,
}) => {
  const email = `workspace-${Date.now()}@axio.test`;
  await verifiedAccount(request, email);
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await seedTriangle(page);
  await page
    .getByRole("button", { name: "Tài liệu của tôi", exact: true })
    .click();
  await page.getByRole("button", { name: "Đăng nhập để lưu" }).click();
  const login = page.getByRole("dialog", { name: "Đăng nhập", exact: true });
  await login.getByLabel("Email", { exact: true }).fill(email);
  await login.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Người dùng kiểm thử", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("AH")),
  ).toBeCloseTo(2.4);
  await page
    .getByRole("button", { name: "Tài liệu của tôi", exact: true })
    .click();
  await page.getByRole("button", { name: "Lưu hình hiện tại" }).click();
  await expect(page.locator(".account-document-list article")).toHaveCount(1);
  const list = await page.request.get("/api/documents").then((r) => r.json());
  const id = list.documents[0].id;
  await page.getByRole("button", { name: "Đóng tài liệu tài khoản" }).click();
  await page.evaluate(() =>
    window.axio!.apply([{ type: "move", target: "B", x: 5, y: 1 }]),
  );
  await expect
    .poll(
      async () => {
        const doc = await page.request
          .get("/api/documents/" + id)
          .then((r) => r.json());
        return doc.version;
      },
      { timeout: 10000 },
    )
    .toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Người dùng kiểm thử", exact: true })
    .click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Đăng nhập", exact: true })
    .getByLabel("Email", { exact: true })
    .fill(email);
  await page
    .getByRole("dialog", { name: "Đăng nhập", exact: true })
    .getByLabel("Mật khẩu", { exact: true })
    .fill(password);
  await page
    .getByRole("dialog", { name: "Đăng nhập", exact: true })
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Người dùng kiểm thử", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tài liệu của tôi", exact: true })
    .click();
  await expect(page.locator(".account-document-list article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Đổi tên Hình dựng mới" })
    .click();
  await page
    .getByRole("textbox", { name: "Tên tài liệu mới" })
    .fill("Bản dựng riêng");
  await page.getByRole("button", { name: "Lưu tên", exact: true }).click();
  await expect(page.locator(".account-document-list")).toContainText(
    "Bản dựng riêng",
  );
  await page.locator(".account-document-list article>button").first().click();
  const confirm = page.getByRole("button", { name: "Xác nhận", exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await expect(
    page.getByRole("dialog", { name: "Tài liệu của tôi" }),
  ).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.axio!.adapter.api.getXcoord("B")))
    .toBeCloseTo(5);
  const oldH = await page.evaluate(() =>
    window.axio!.adapter.api.getXcoord("H"),
  );
  await page.evaluate(() =>
    window.axio!.apply([{ type: "move", target: "C", x: 1, y: 5 }]),
  );
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getXcoord("H")),
  ).not.toBeCloseTo(oldH);
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/documents/" + id);
      return (await response.json()).version;
    })
    .toBeGreaterThan(2);
  await page
    .getByRole("button", { name: "Tài liệu của tôi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xóa tài liệu Bản dựng riêng", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.locator(".account-document-list article")).toHaveCount(0);
  expect((await page.request.get("/api/documents/" + id)).status()).toBe(404);
  await page.screenshot({ path: "docs/upgrade-workspace.png" });
  // The protected server API never trusts an owner supplied by a client.
  expect(
    (
      await page.request.post("/api/documents", {
        headers: { Origin: origin },
        data: {
          title: "Giả chủ sở hữu",
          data: "UEsDBAoAAAAA",
          userId: "another-user",
        },
      })
    ).status(),
  ).toBe(400);
});
