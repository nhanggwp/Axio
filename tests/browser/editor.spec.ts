import { test, expect } from "../fixtures";
async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Dựng ví dụ tam giác", exact: true })
    .click();
}
test("A/B/C/F: real engine, altitude, dynamic dependency, persistence and undo", async ({
  page,
}) => {
  await ready(page);
  const initial = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    a.evalCommand("testAngle=Angle(B,A,C)");
    return {
      AB: a.getValue("AB"),
      AC: a.getValue("AC"),
      BC: a.getValue("BC"),
      AH: a.getValue("AH"),
      H: [a.getXcoord("H"), a.getYcoord("H")],
      angle: a.getValue("testAngle"),
    };
  });
  expect(initial.AB).toBeCloseTo(3);
  expect(initial.AC).toBeCloseTo(4);
  expect(initial.BC).toBeCloseTo(5);
  expect(initial.AH).toBeCloseTo(2.4);
  expect(initial.H[0]).toBeCloseTo(1.92);
  expect(initial.H[1]).toBeCloseTo(1.44);
  expect(initial.angle).toBeCloseTo(Math.PI / 2);
  const dynamic = await page.evaluate(() => {
    const c = window.axio!,
      a = c.adapter.api;
    c.apply([{ type: "move", target: "B", x: 5, y: 1 }]);
    return {
      H: [a.getXcoord("H"), a.getYcoord("H")],
      B: [a.getXcoord("B"), a.getYcoord("B")],
      C: [a.getXcoord("C"), a.getYcoord("C")],
      A: [a.getXcoord("A"), a.getYcoord("A")],
      BC: a.getValue("BC"),
      projected: c.objects.find((o) => o.name === "BC")!.value,
    };
  });
  const [hx, hy] = dynamic.H,
    [bx, by] = dynamic.B,
    [cx, cy] = dynamic.C,
    [ax, ay] = dynamic.A;
  expect((hx - bx) * (cy - by) - (hy - by) * (cx - bx)).toBeCloseTo(0);
  expect((hx - ax) * (cx - bx) + (hy - ay) * (cy - by)).toBeCloseTo(0);
  expect(dynamic.BC).toBeCloseTo(Math.sqrt(34));
  expect(dynamic.projected).toContain("5.83");
  await page.evaluate(() => window.axio!.undo());
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("BC")),
  ).toBeCloseTo(5);
  await page
    .getByRole("button", { name: "Khảo sát tam giác vuông", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lưu trên thiết bị", exact: true })
    .click();
  await expect(page.locator(".document-dialog [role=status]")).toHaveText(
    "Đã lưu trên thiết bị này.",
  );
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
  await page
    .getByRole("button", { name: "Hình dựng mới", exact: true })
    .click();
  await page.locator(".saved-documents b").first().click();
  await page
    .getByRole("button", { name: "Thay thế tài liệu", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.axio!.adapter.api.getValue("AH")))
    .toBeCloseTo(2.4);
  await page.evaluate(() =>
    window.axio!.apply([{ type: "move", target: "C", x: 1, y: 5 }]),
  );
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getYcoord("H")),
  ).not.toBeCloseTo(1.44);
  await page.screenshot({ path: "docs/editor-desktop.png" });
});
test("D/E: validated AI preview, cancel, apply, undo and ambiguity without mutation", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    const c = window.axio!;
    c.apply([{ type: "delete", target: "H" }]);
  });
  // Stub only network response to make the UI workflow repeatable. Geometry remains the real GeoGebra engine.
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      json: {
        message: "Đề xuất dựng đường cao AH.",
        status: "ready_to_preview",
        actions: [
          { type: "altitude", vertex: "A", base: "BC", foot: "H", label: "AH" },
        ],
      },
    }),
  );
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Dựng đường cao từ A xuống BC.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("H"))).toBe(
    false,
  );
  await page.getByRole("button", { name: "Bỏ thay đổi", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("H"))).toBe(
    false,
  );
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Dựng đường cao từ A xuống BC.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("AH")),
  ).toBeCloseTo(2.4);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.adapter.api.exists("H"))).toBe(
    false,
  );
  expect(
    await page.evaluate(() => window.axio!.adapter.api.exists("ABC")),
  ).toBe(true);
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      json: {
        message: "Bạn muốn đổi đường nào? Chọn đường và đối tượng tham chiếu.",
        status: "needs_clarification",
        missing_parameters: ["reference_line"],
        selection_request: {
          allowed_types: ["line", "segment", "ray"],
          min: 1,
          max: 1,
        },
        pending: {
          id: "clarification-test",
          original_request: "Cho đường này vuông góc.",
          intent: "perpendicular",
          resolved: {},
          missing_parameters: ["reference_line"],
          selection_request: {
            allowed_types: ["line", "segment", "ray"],
            min: 1,
            max: 1,
          },
          step: 1,
        },
        actions: [],
      },
    }),
  );
  const count = await page.evaluate(() => window.axio!.objects.length);
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Cho đường này vuông góc.");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByText(/Cần làm rõ yêu cầu/)).toBeVisible();
  expect(await page.evaluate(() => window.axio!.objects.length)).toBe(count);
});
test("rollback impossible geometry and reject constrained point edits", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const c = window.axio!;
    const before = c.adapter.snapshot();
    let errors = 0;
    try {
      c.apply([
        { type: "point", label: "P", x: 0, y: 0 },
        { type: "point", label: "Q", x: 1, y: 0 },
        { type: "point", label: "R", x: 2, y: 0 },
        {
          type: "construct",
          kind: "circumcircle",
          label: "badCircle",
          refs: ["P", "Q", "R"],
        },
      ]);
    } catch {
      errors++;
    }
    try {
      c.apply([{ type: "move", target: "H", x: 0, y: 0 }]);
    } catch {
      errors++;
    }
    return {
      errors,
      unchanged:
        c.adapter
          .snapshot()
          .match(/<construction[\s\S]*?<\/construction>/)?.[0] ===
        before.match(/<construction[\s\S]*?<\/construction>/)?.[0],
    };
  });
  expect(result).toEqual({ errors: 2, unchanged: true });
});
test("manual point tool and tablet layout", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "ĐIỂM", exact: true }).click();
  await page.getByRole("button", { name: "Điểm", exact: true }).click();
  const canvas = page.locator(".workspace");
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds!.x + 100, bounds!.y + 120);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.axio!.objects.filter((o) => o.type === "point").length,
      ),
    )
    .toBe(5);
  await page.setViewportSize({ width: 768, height: 1024 });
  if (await page.getByRole("button", { name: "Đóng thuộc tính" }).isVisible())
    await page.getByRole("button", { name: "Đóng thuộc tính" }).click();
  await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
  await expect(
    page.getByRole("button", { name: "Hỏi trợ lý hình học" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/editor-tablet.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("actual pointer drag updates dependents, and documented modes are accepted", async ({
  page,
}) => {
  await ready(page);
  const start = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    const v = JSON.parse(a.getViewProperties(1));
    const canvas = document
      .querySelector(".workspace")!
      .getBoundingClientRect();
    return {
      x: canvas.x + (a.getXcoord("B") - v.xMin) / v.invXscale,
      y: canvas.y + v.height - (a.getYcoord("B") - v.yMin) / v.invYscale,
      h: a.getXcoord("H"),
    };
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y - 40, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.axio!.adapter.api.getXcoord("H")))
    .not.toBeCloseTo(start.h);
  await expect(
    page.getByRole("heading", { name: "Điểm B", exact: true }),
  ).toBeVisible();
  const results = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    return [
      0, 40, 1, 501, 5, 19, 15, 2, 18, 16, 51, 10, 34, 11, 4, 3, 8, 9, 36, 38,
      49, 30, 29, 31, 7, 32, 33, 6, 27,
    ].map((id) => {
      a.setMode(id);
      return { id, actual: a.getMode() };
    });
  });
  for (const result of results)
    expect(result.actual, `GeoGebra mode ${result.id}`).toBe(result.id);
});

test("PNG, SVG, ggb export/import preserve construction and invalid files are rejected", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  for (const [label, extension] of [
    ["Ảnh PNG · độ phân giải 2×", ".png"],
    ["Ảnh vector SVG", ".svg"],
    ["Tải xuống .ggb · chỉnh sửa được", ".ggb"],
  ]) {
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await waiting;
    expect(file.suggestedFilename()).toContain(extension);
    expect(await file.failure()).toBeNull();
  }
  await page
    .getByRole("button", { name: "Đóng hộp thoại", exact: true })
    .click();
  const restored = await page.evaluate(async () => {
    const c = window.axio!,
      base64 = await c.adapter.base64();
    c.mutate(() => c.adapter.api.newConstruction());
    await c.openDocument(base64);
    let rejected = false;
    try {
      await c.openDocument("invalid");
    } catch {
      rejected = true;
    }
    return { length: c.adapter.api.getValue("AH"), rejected };
  });
  expect(restored).toEqual({ length: 2.4, rejected: true });
});

test("disconnected AI is truthful and never submits a request", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { configured: false, model: "deepseek-flash" } }),
  );
  let requests = 0;
  await page.route("**/api/assist", (route) => {
    requests++;
    return route.abort();
  });
  await ready(page);
  await expect(
    page.getByText("DeepSeek · Chưa kết nối", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Vẽ điểm P");
  await expect(
    page.getByRole("button", { name: "Gửi yêu cầu" }),
  ).toBeDisabled();
  await page.getByRole("textbox", { name: "Yêu cầu hình học" }).press("Enter");
  expect(requests).toBe(0);
});

test("AI triangle names its real polygon boundaries without duplicate edges", async ({
  page,
}) => {
  await ready(page);
  const segments = await page.evaluate(() => {
    const c = window.axio!;
    c.mutate(() => c.adapter.api.newConstruction());
    c.apply([
      { type: "point", label: "P", x: 0, y: 0 },
      { type: "point", label: "Q", x: 3, y: 0 },
      { type: "point", label: "R", x: 0, y: 4 },
      {
        type: "construct",
        label: "PQR",
        kind: "polygon",
        refs: ["P", "Q", "R"],
      },
      { type: "construct", label: "PQ", kind: "segment", refs: ["P", "Q"] },
      { type: "construct", label: "QR", kind: "segment", refs: ["Q", "R"] },
      { type: "construct", label: "RP", kind: "segment", refs: ["R", "P"] },
    ]);
    return c.objects
      .filter((o) => o.type === "segment")
      .map((o) => o.name)
      .sort();
  });
  expect(segments).toEqual(["PQ", "QR", "RP"]);
});

test("circle overloads resolve actual triangle vertices and remain dynamic", async ({
  page,
}) => {
  await ready(page);
  const values = await page.evaluate(() => {
    const c = window.axio!;
    c.apply([
      {
        type: "construct",
        kind: "circumcircle",
        label: "circTri",
        refs: ["ABC"],
      },
      {
        type: "construct",
        kind: "circle",
        label: "circPoints",
        refs: ["A", "B", "C"],
      },
    ]);
    c.apply([{ type: "move", target: "B", x: 5, y: 1 }]);
    return {
      types: ["circTri", "circPoints"].map((n) =>
        c.adapter.api.getObjectType(n),
      ),
      commands: ["circTri", "circPoints"].map((n) =>
        c.adapter.api.getCommandString(n, false),
      ),
      defined: ["circTri", "circPoints"].every((n) =>
        c.adapter.api.isDefined(n),
      ),
    };
  });
  expect(values.types).toEqual(["circle", "circle"]);
  expect(
    values.commands.every(
      (s) => s.includes("A") && s.includes("B") && s.includes("C"),
    ),
  ).toBe(true);
  expect(values.defined).toBe(true);
});
