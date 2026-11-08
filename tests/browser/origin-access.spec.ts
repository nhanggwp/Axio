import { test, expect } from "../fixtures";
import { agentReply, observeAgent } from "../helpers/agent";
import { password, verifiedAccount } from "../helpers/auth";

test("local aliases reach the API, the API-port page opens the frontend, and foreign origins remain blocked", async ({ page, request }) => {
  await page.goto("http://localhost:5175", { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(async () => (await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  expect(status).toBe(400);
  const denied = await request.post("/api/assist", { headers: { Origin: "http://localhost:5174" }, data: {} });
  expect(denied.status()).toBe(403);
  await page.goto("http://127.0.0.1:3005");
  await expect(page).toHaveURL("http://127.0.0.1:5175/");
});

test("real authentication and personal document cookies work on localhost", async ({ page, request }) => {
  const email = `alias-${Date.now()}@axio.test`;
  await verifiedAccount(request, email);
  await page.goto("http://localhost:5175");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  const signIn = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    return response.status;
  }, { email, password });
  expect(signIn).toBe(200);
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  const restored = await page.evaluate(async () => (await fetch("/api/auth/get-session").then((r) => r.json()))?.user?.email);
  expect(restored).toBe(email);
  const saved = await page.evaluate(async () => {
    const data = await window.axio!.adapter.base64();
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Tài liệu localhost", data }) });
    return { status: response.status, title: (await response.json()).title };
  });
  expect(saved).toEqual({ status: 201, title: "Tài liệu localhost" });
});

test("live triangle request succeeds from localhost and after opening the API URL", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(180000);
  for (const address of ["http://localhost:5175", "http://127.0.0.1:3005"]) {
    await page.goto(address);
    await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
    await observeAgent(page);
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("vẽ tui một hình tam giác được k");
    await expect(page.getByRole("button", { name: "Gửi yêu cầu" })).toBeEnabled();
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const { plan } = await agentReply(page, 0);
    expect(plan.status, plan.message).toBe("ready_to_preview");
    await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
    expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    expect(await page.evaluate(() => window.axio!.objects.some((o) => o.type === "triangle"))).toBe(true);
  }
});
