import { seedTriangle } from "../helpers/sample";
import { test, expect, type Page } from "../fixtures";
import { verifiedAccount, password, post } from "../helpers/auth";
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await expect(page.locator(".session-current-name")).toHaveText("Phiên 1");
}
async function select(page: Page, name: string) {
  await page.getByRole("button", { name: "Chọn phiên làm việc", exact: true }).click();
  await page.getByRole("tab", { name, exact: true }).click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await expect(page.locator(".session-current-name")).toHaveText(name);
}
async function create(page: Page) {
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await expect(page.locator(".session-loading")).toBeHidden();
}

test("each session retains independent geometry, chat, composer and undo across switches and reload", async ({ page }) => {
  await ready(page);
  const payloads: { conversation: { content: string }[]; objects: { name: string }[] }[] = [];
  await page.route("**/api/assist", (route) => {
    const body = route.request().postDataJSON(); payloads.push(body);
    return route.fulfill({ json: { status: "explanation", message: body.request.includes("đầu") ? "Hội thoại của phiên đầu." : "Hội thoại của phiên thứ hai.", actions: [] } });
  });
  await seedTriangle(page);
  const composer = page.getByRole("textbox", { name: "Yêu cầu hình học" });
  await composer.fill("Giải thích hình ở phiên đầu.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".conversation")).toContainText("Hội thoại của phiên đầu.");
  await composer.fill("Bản nháp chỉ dành cho phiên đầu");
  await create(page);
  await expect(page.locator(".session-current-name")).toHaveText("Phiên 2");
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await expect(composer).toHaveValue("");
  await expect(page.locator(".conversation")).not.toContainText("Hội thoại của phiên đầu.");
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "P", x: 1, y: 2 }]));
  await composer.fill("Giải thích hình ở phiên thứ hai.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".conversation")).toContainText("Hội thoại của phiên thứ hai.");
  expect(payloads[1].conversation).toEqual([]);
  expect(payloads[1].objects.map((o) => o.name)).toEqual(["P"]);
  await select(page, "Phiên 1");
  expect(await page.evaluate(() => window.axio!.adapter.api.getValue("AH"))).toBeCloseTo(2.4);
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("P"))).toBe(false);
  await expect(composer).toHaveValue("Bản nháp chỉ dành cho phiên đầu");
  await page.evaluate(() => { window.axio!.apply([{ type: "move", target: "B", x: 5, y: 1 }]); window.axio!.undo(); });
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("B"))).toBe(3);
  await select(page, "Phiên 2");
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("AH"))).toBe(false);
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(1);
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  await expect(page.locator(".session-current-name")).toHaveText("Phiên 2");
  await expect(page.locator(".conversation")).toContainText("Hội thoại của phiên thứ hai.");
  expect(await page.evaluate(() => window.axio!.adapter.api.getYcoord("P"))).toBe(2);
  await select(page, "Phiên 1");
  await expect(composer).toHaveValue("Bản nháp chỉ dành cho phiên đầu");
  expect(await page.evaluate(() => window.axio!.adapter.api.getValue("AH"))).toBeCloseTo(2.4);
  await page.screenshot({ path: "docs/multiple-sessions.png" });
});

test("clarification and automatic selection continuation remain within their session", async ({ page }) => {
  await ready(page);
  await seedTriangle(page);
  const requests: { pending?: { id: string }; objects: { name: string }[] }[] = [];
  await page.route("**/api/assist", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: requests.length === 1 ? {
      status: "needs_clarification", message: "Bạn muốn chọn đường nào?", missing_parameters: ["line"], selection_request: { allowed_types: ["segment"], min: 1, max: 1 },
      pending: { id: "first-session-intent", original_request: "Dựng vuông góc với đường này.", intent: "perpendicular", resolved: {}, missing_parameters: ["line"], step: 1, selection_request: { allowed_types: ["segment"], min: 1, max: 1 } }, actions: [],
    } : { status: "explanation", message: "Đã nhận đúng đường AB của phiên đầu.", actions: [] } });
  });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Dựng vuông góc với đường này.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.locator(".clarification")).toBeVisible();
  await create(page);
  await expect(page.locator(".clarification")).toBeHidden();
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "X", x: 1, y: 1 }]));
  expect(requests).toHaveLength(1);
  await select(page, "Phiên 1");
  await expect(page.locator(".clarification")).toContainText("Bạn muốn chọn đường nào?");
  await page.locator(".explorer").getByRole("button", { name: "AB 3", exact: true }).click();
  await expect(page.locator(".conversation")).toContainText("Đã nhận đúng đường AB");
  expect(requests[1].pending?.id).toBe("first-session-intent");
  expect(requests[1].objects.some((o) => o.name === "X")).toBe(false);
});

test("rename, clone and confirmed deletion preserve independent contents, including deleting the last session", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "P", x: 1, y: 2 }]));
  await page.getByRole("button", { name: "Chọn phiên làm việc", exact: true }).click();
  await page.getByRole("button", { name: "Quản lý phiên", exact: true }).click();
  await page.getByRole("button", { name: "Đổi tên phiên Phiên 1", exact: true }).click();
  await page.getByRole("textbox", { name: "Tên phiên mới", exact: true }).fill("Bài toán A");
  await page.getByRole("button", { name: "Lưu tên phiên", exact: true }).click();
  await expect(page.locator(".session-current-name")).toHaveText("Bài toán A");
  await page.getByRole("button", { name: "Nhân bản phiên hiện tại", exact: true }).click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.getByRole("button", { name: "Đóng quản lý phiên", exact: true }).click();
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "P", x: 9, y: 2 }]));
  await select(page, "Bài toán A");
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(1);
  await page.getByRole("button", { name: "Chọn phiên làm việc", exact: true }).click();
  await page.getByRole("button", { name: "Quản lý phiên", exact: true }).click();
  await page.getByRole("button", { name: "Xóa phiên Bài toán A (bản sao)", exact: true }).click();
  await expect(page.locator(".session-list article")).toHaveCount(2);
  await page.getByRole("button", { name: "Xóa phiên và nội dung", exact: true }).click();
  await expect(page.locator(".session-list article")).toHaveCount(1);
  await page.getByRole("button", { name: "Xóa phiên Bài toán A", exact: true }).click();
  await page.getByRole("button", { name: "Xóa phiên và nội dung", exact: true }).click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await expect(page.locator(".session-list article")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Mở phiên Bài toán A", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await page.getByRole("button", { name: "Đóng quản lý phiên", exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
});

test("a pending preview must be applied or discarded before a session switch", async ({ page }) => {
  await ready(page);
  await page.route("**/api/assist", (route) => route.fulfill({ json: { status: "ready_to_preview", message: "Đề xuất điểm P.", actions: [{ type: "point", label: "P", x: 2, y: 3 }] } }));
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Vẽ điểm P.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByRole("button", { name: "Áp dụng", exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Tạo phiên mới", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Bỏ thay đổi", exact: true }).click();
  await create(page);
  await select(page, "Phiên 1");
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await expect(page.locator(".message-outcome.cancelled")).toHaveCount(1);
});

test("account autosave follows the document bound to each editor session", async ({ page, request }) => {
  const email = `sessions-${Date.now()}@axio.test`;
  await verifiedAccount(request, email);
  expect((await post(page.request, "sign-in/email", { email, password })).ok()).toBe(true);
  await ready(page);
  const save = async () => {
    await page.getByRole("button", { name: "Tài liệu của tôi", exact: true }).click();
    const count = await page.locator(".account-document-list article").count();
    await page.getByRole("button", { name: "Lưu hình hiện tại", exact: true }).click();
    await expect(page.locator(".account-document-list article")).toHaveCount(count + 1);
    await page.getByRole("button", { name: "Đóng tài liệu tài khoản", exact: true }).click();
  };
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "P", x: 1, y: 1 }]));
  await save();
  const first = (await page.request.get("/api/documents").then((r) => r.json())).documents[0].id;
  await create(page);
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "Q", x: 2, y: 2 }]));
  await save();
  const second = (await page.request.get("/api/documents").then((r) => r.json())).documents.find((d: { id: string }) => d.id !== first).id;
  await select(page, "Phiên 1");
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "P", x: 7, y: 1 }]));
  await expect.poll(async () => (await page.request.get("/api/documents/" + first).then((r) => r.json())).version).toBeGreaterThan(1);
  expect((await page.request.get("/api/documents/" + second).then((r) => r.json())).version).toBe(1);
  await select(page, "Phiên 2");
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("Q"))).toBe(2);
  const firstVersion = (await page.request.get("/api/documents/" + first).then((r) => r.json())).version;
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "Q", x: 8, y: 2 }]));
  await expect.poll(async () => (await page.request.get("/api/documents/" + second).then((r) => r.json())).version).toBeGreaterThan(1);
  expect((await page.request.get("/api/documents/" + first).then((r) => r.json())).version).toBe(firstVersion);
});

test("the recovery draft preserves immediate edits and never resurrects an undone construction", async ({ page }) => {
  await ready(page);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "P", x: 1, y: 2 }]));
  await expect(page.locator(".session-save-status")).toHaveText("Đã lưu phiên cục bộ");
  await page.evaluate(() => { window.axio!.apply([{ type: "move", target: "P", x: 9, y: 2 }]); window.axio!.undo(); });
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill("Nháp vừa nhập trước khi tải lại");
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, { timeout: 60000 });
  await expect(page.locator(".session-loading")).toBeHidden();
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(1);
  await expect(page.getByRole("textbox", { name: "Yêu cầu hình học" })).toHaveValue("Nháp vừa nhập trước khi tải lại");
});

test("a newer stored version is protected and the local construction can be forked", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "P", x: 1, y: 2 }]));
  await expect(page.locator(".session-save-status")).toHaveText("Đã lưu phiên cục bộ");
  // A separate real IndexedDB transaction represents another tab committing a version.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("axio-editor-sessions", 1);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(["meta", "records"], "readwrite"), id = sessionStorage.getItem("axio-active-session")!;
      for (const name of ["meta", "records"]) {
        const store = tx.objectStore(name), request = store.get(id);
        request.onsuccess = () => store.put({ ...request.result, version: request.result.version + 1, updatedAt: new Date().toISOString() });
      }
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }));
  await page.evaluate(() => window.axio!.apply([{ type: "move", target: "P", x: 7, y: 2 }]));
  await expect(page.locator(".session-save-status")).toHaveText("Chưa lưu phiên");
  await page.getByRole("button", { name: "Chọn phiên làm việc", exact: true }).click();
  await page.getByRole("button", { name: "Quản lý phiên", exact: true }).click();
  await expect(page.locator(".session-dialog [role=alert]")).toContainText("tab khác");
  await page.getByRole("button", { name: "Nhân bản phiên hiện tại", exact: true }).click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.getByRole("button", { name: "Đóng quản lý phiên", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(7);
  await select(page, "Phiên 1");
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(1);
  await select(page, "Phiên 1 (bản sao)");
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(7);
});

test("a failed session write restores the current construction and shows the storage error", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.axio!.apply([{ type: "point", label: "P", x: 1, y: 2 }]));
  await expect(page.locator(".session-save-status")).toHaveText("Đã lưu phiên cục bộ");
  await page.evaluate(() => {
    const actual = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === "records" && value.name === "Phiên 2") throw new DOMException("Test-only storage quota failure", "QuotaExceededError");
      return key === undefined ? actual.call(this, value) : actual.call(this, value, key);
    };
  });
  await create(page);
  await expect(page.locator(".session-current-name")).toHaveText("Phiên 1");
  expect(await page.evaluate(() => window.axio!.adapter.api.getXcoord("P"))).toBe(1);
  await page.getByRole("button", { name: "Chọn phiên làm việc", exact: true }).click();
  await page.getByRole("button", { name: "Quản lý phiên", exact: true }).click();
  await expect(page.locator(".session-dialog [role=alert]")).toContainText("Bộ nhớ trình duyệt đã đầy");
});

test("switching sessions retains older chat history beyond the former single-draft limit", async ({ page }) => {
  await ready(page);
  await page.route("**/api/assist", (route) => route.fulfill({ json: { status: "explanation", message: `Trả lời ${route.request().postDataJSON().request}`, actions: [] } }));
  for (let i = 1; i <= 21; i++) {
    await page.getByRole("textbox", { name: "Yêu cầu hình học" }).fill(`Câu hỏi ${i}`);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.locator(".assistant-message").last()).toHaveText(`TRỢ LÝTrả lời Câu hỏi ${i}`);
  }
  await create(page);
  await select(page, "Phiên 1");
  await expect(page.locator(".conversation .message")).toHaveCount(42);
  await expect(page.locator(".user-message").first()).toContainText("Câu hỏi 1");
  await expect(page.locator(".assistant-message").last()).toContainText("Trả lời Câu hỏi 21");
});
