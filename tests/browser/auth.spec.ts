import { test, expect } from "../fixtures";
import {
  origin,
  password,
  post,
  mailLink,
  verifiedAccount,
} from "../helpers/auth";
test("real email registration, verification, login, session restoration, password reset, profile and deletion", async ({
  page,
  request,
}) => {
  const email = `flow-${Date.now()}@axio.test`;
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Dựng ví dụ tam giác", exact: true })
    .click();
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  const register = page.getByRole("dialog", { name: "Đăng ký", exact: true });
  await register.getByLabel("Tên hiển thị").fill("Nhân kiểm thử");
  await register.getByLabel("Email", { exact: true }).fill(email);
  await register.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await register.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Xác minh email" }),
  ).toBeVisible();
  expect(
    (await post(request, "sign-in/email", { email, password })).status(),
  ).toBe(403);
  await request.get(await mailLink(email, "verify-email"));
  await page.getByRole("button", { name: "Quay lại đăng nhập" }).click();
  const login = page.getByRole("dialog", { name: "Đăng nhập", exact: true });
  await login.getByLabel("Email", { exact: true }).fill(email);
  await login.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  await login.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(login.getByRole("alert")).toContainText("Email hoặc mật khẩu");
  await login.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Nhân kiểm thử", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("AH")),
  ).toBeCloseTo(2.4);
  const cookie = (await page.context().cookies()).find((c) =>
    c.name.includes("session_token"),
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: "Nhân kiểm thử", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nhân kiểm thử", exact: true })
    .click();
  const profile = page.getByRole("dialog", { name: "Hồ sơ cá nhân" });
  await profile.getByLabel("Tên hiển thị").fill("Hồ sơ đã đổi");
  await profile.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
  await expect(profile.getByRole("status")).toHaveText("Đã cập nhật hồ sơ.");
  await profile.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/documents")).status()).toBe(401);
  expect(
    (
      await post(request, "request-password-reset", {
        email,
        redirectTo: origin + "/?auth=reset",
      })
    ).ok(),
  ).toBe(true);
  await page.goto(await mailLink(email, "reset-password"));
  await expect(
    page.getByRole("dialog", { name: "Đặt lại mật khẩu", exact: true }),
  ).toBeVisible();
  const nextPassword = "Axio-New-Password-2026!";
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(nextPassword);
  await page
    .getByRole("button", { name: "Đặt lại mật khẩu", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(nextPassword);
  await page
    .getByRole("dialog", { name: "Đăng nhập", exact: true })
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hồ sơ đã đổi", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hồ sơ đã đổi", exact: true }).click();
  await page.locator(".auth-dialog details summary").click();
  const passwordForm = page.locator(".auth-dialog details form");
  const changedPassword = "Axio-Profile-Changed-2026!";
  await passwordForm
    .getByLabel("Mật khẩu hiện tại", { exact: true })
    .fill(nextPassword);
  await passwordForm
    .getByLabel("Mật khẩu mới", { exact: true })
    .fill(changedPassword);
  await passwordForm
    .getByRole("button", { name: "Đổi mật khẩu", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Hồ sơ cá nhân" }).getByRole("status"),
  ).toHaveText("Đã đổi mật khẩu và thu hồi các phiên khác.");
  await page.screenshot({
    path: "docs/upgrade-profile.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Xóa tài khoản", exact: true })
    .click();
  await page.getByLabel("Xác nhận", { exact: true }).fill("XÓA");
  await page
    .getByLabel("Mật khẩu hiện tại", { exact: true })
    .last()
    .fill(changedPassword);
  await page
    .getByRole("button", { name: "Xóa vĩnh viễn", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  expect(
    (
      await post(request, "sign-in/email", { email, password: changedPassword })
    ).status(),
  ).toBe(401);
});

test("documents enforce ownership, optimistic versions and survive logout/login", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin }),
    b = await playwright.request.newContext({ baseURL: origin });
  const emailA = `owner-a-${Date.now()}@axio.test`,
    emailB = `owner-b-${Date.now()}@axio.test`;
  await verifiedAccount(a, emailA);
  await verifiedAccount(b, emailB);
  expect(
    (await post(a, "sign-in/email", { email: emailA, password })).ok(),
  ).toBe(true);
  expect(
    (await post(b, "sign-in/email", { email: emailB, password })).ok(),
  ).toBe(true);
  const created = await a.post("/api/documents", {
    headers: { Origin: origin },
    data: { title: "Tài liệu riêng", data: "UEsDBAoAAAAA" },
  });
  expect(created.status()).toBe(201);
  const doc = await created.json();
  for (const method of ["get", "patch", "delete"] as const) {
    const response =
      method === "patch"
        ? await b.patch("/api/documents/" + doc.id, {
            data: { title: "Không được sửa", version: 1 },
            headers: { Origin: origin },
          })
        : await b[method]("/api/documents/" + doc.id, {
            headers: { Origin: origin },
          });
    expect(response.status()).toBe(404);
  }
  const patch = await a.patch("/api/documents/" + doc.id, {
    headers: { Origin: origin },
    data: { title: "Đã đổi tên", version: 1 },
  });
  expect(patch.status()).toBe(200);
  expect(
    (
      await a.patch("/api/documents/" + doc.id, {
        headers: { Origin: origin },
        data: { title: "Cũ", version: 1 },
      })
    ).status(),
  ).toBe(409);
  await post(a, "sign-out", {});
  expect((await a.get("/api/documents")).status()).toBe(401);
  await post(a, "sign-in/email", { email: emailA, password });
  expect((await a.get("/api/documents/" + doc.id)).status()).toBe(200);
  expect((await a.get("/api/documents/" + doc.id)).ok()).toBe(true);
  await a.dispose();
  await b.dispose();
});
