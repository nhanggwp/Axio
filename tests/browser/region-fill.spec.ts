import { test, expect, type Page } from "../fixtures";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.evaluate(() => {
    window.axio!.apply([
      { type: "point", label: "O", x: 0, y: 0 },
      {
        type: "construct",
        kind: "circle_radius",
        label: "c",
        refs: ["O"],
        value: 4,
      },
      {
        type: "construct",
        kind: "point_on",
        label: "A",
        refs: ["c"],
        position: { x: 4, y: 0 },
      },
      {
        type: "construct",
        kind: "point_on",
        label: "B",
        refs: ["c"],
        position: { x: 0, y: 4 },
      },
      { type: "construct", kind: "segment", label: "AB", refs: ["A", "B"] },
    ]);
    window.axio!.adapter.api.setGridVisible(false);
  });
}
async function fill(page: Page, kind = "circular_segment", part = "minor") {
  await page.getByRole("button", { name: "Tô vùng", exact: true }).click();
  await page.getByLabel("Loại vùng tô", { exact: true }).selectOption(kind);
  await page.getByLabel("Phần cung", { exact: true }).selectOption(part);
  await page.getByRole("button", { name: "Tô màu", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Tô vùng", exact: true }),
  ).toBeHidden();
}
async function pixels(page: Page, points: { x: number; y: number }[]) {
  return page.evaluate(async (points) => {
    const api = window.axio!.adapter.api,
      v = JSON.parse(api.getViewProperties(1));
    const image = new Image();
    image.src = "data:image/png;base64," + api.getPNGBase64(1, false);
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return points.map((p) => {
      const x = Math.round((p.x - v.xMin) / v.invXscale),
        y = Math.round(v.height - (p.y - v.yMin) / v.invYscale);
      return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    });
  }, points);
}
test("manual circular segment fills only the cap, tracks a real drag, and supports undo, reload and export", async ({
  page,
}, info) => {
  await ready(page);
  await fill(page);
  expect(
    await page.evaluate(() => {
      const a = window.axio!.adapter.api;
      return {
        type: a.getObjectType("region1"),
        opacity: window.axio!.objects.find((o) => o.name === "region1")!
          .opacity,
        label: a.getXML("region1").includes('label="true"'),
      };
    }),
  ).toEqual({ type: "arc", opacity: 0.45, label: false });
  let values = await pixels(page, [
    { x: 2.6, y: 2.6 },
    { x: 1, y: 1 },
    { x: -2.5, y: 2.5 },
  ]);
  expect(values[0][2]).toBeGreaterThan(values[0][0] + 40);
  expect(values[1]).toEqual([255, 255, 255]);
  expect(values[2]).toEqual([255, 255, 255]);
  await page.screenshot({ path: info.outputPath("circular-segment.png") });
  const before = await page.evaluate(() =>
    window.axio!.adapter.api.getValue("region1"),
  );
  // Drag B on its native circular path; the original circle must stay fixed.
  const location = await page.evaluate(() => {
    const a = window.axio!.adapter.api,
      v = JSON.parse(a.getViewProperties(1)),
      r = document
        .querySelector(".main-engine .EuclidianPanel")!
        .getBoundingClientRect();
    return {
      x: r.left + (a.getXcoord("B") - v.xMin) / v.invXscale,
      y: r.top + v.height - (a.getYcoord("B") - v.yMin) / v.invYscale,
      tx: r.left + (2 - v.xMin) / v.invXscale,
      ty: r.top + v.height - (Math.sqrt(12) - v.yMin) / v.invYscale,
    };
  });
  await page.mouse.move(location.x, location.y);
  await page.mouse.down();
  await page.mouse.move(location.tx, location.ty, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.axio!.adapter.api.getXcoord("B")))
    .toBeCloseTo(2, 1);
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getValue("region1")),
  ).toBeLessThan(before);
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getXML("c")),
  ).toContain('A2="-16"');
  await page.evaluate(() => window.axio!.undo());
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getXcoord("B")),
  ).toBeCloseTo(0, 6);
  await page.evaluate(() => window.axio!.undo());
  expect(
    await page.evaluate(() => window.axio!.adapter.api.exists("region1")),
  ).toBe(false);
  await page.evaluate(() => window.axio!.redo());
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(
    await page.evaluate(
      () => window.axio!.objects.find((o) => o.name === "region1")!.opacity,
    ),
  ).toBe(0.45);
  const svg = await page.evaluate(() => window.axio!.adapter.exportSVG());
  expect(svg).toMatch(/(?:#09aff0|rgb\(9,\s*175,\s*240\))/i);
  await info.attach("filled-export.svg", {
    body: svg,
    contentType: "image/svg+xml",
  });
  const png = await page.evaluate(() => window.axio!.adapter.exportPNG());
  await info.attach("filled-export.png", { body: Buffer.from(png, "base64"), contentType: "image/png" });
  const bluePixels = await page.evaluate(async data => {
    const image = new Image(); image.src = "data:image/png;base64," + data; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    const values = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let count = 0;
    for (let i = 0; i < values.length; i += 4) if (values[i + 2] > values[i] + 40) count++;
    return count;
  }, png);
  expect(bluePixels).toBeGreaterThan(1000);
  await page
    .locator(".explorer .object-value")
    .filter({ hasText: "region1" })
    .click();
  await page
    .getByRole("slider", { name: "Độ đậm màu vùng", exact: true })
    .fill("0");
  expect(
    await page.evaluate(
      () => window.axio!.objects.find((o) => o.name === "region1")!.opacity,
    ),
  ).toBe(0);
});
test("major segment and sector select the correct areas and reject invalid fills atomically", async ({
  page,
}) => {
  await ready(page);
  await fill(page, "circular_segment", "major");
  const values = await pixels(page, [
    { x: 2.6, y: 2.6 },
    { x: 1, y: 1 },
    { x: -2.5, y: 2.5 },
  ]);
  expect(values[0]).toEqual([255, 255, 255]);
  expect(values[1][2]).toBeGreaterThan(values[1][0] + 40);
  expect(values[2][2]).toBeGreaterThan(values[2][0] + 40);
  await page.evaluate(() =>
    window.axio!.apply([{ type: "delete", target: "region1" }]),
  );
  await fill(page, "circular_sector", "minor");
  expect(
    await page.evaluate(() => ({
      type: window.axio!.adapter.api.getObjectType("region1"),
      area: window.axio!.adapter.api.getValue("region1"),
    })),
  ).toEqual({ type: "sector", area: 4 * Math.PI });
  const error = await page.evaluate(() => {
    try {
      window.axio!.apply([
        { type: "style", target: "AB", color: "#E31665", opacity: 0.5 },
      ]);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(error).toContain("miền diện tích");
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getColor("AB")),
  ).toBe("#23232D");
  const duplicate = await page.evaluate(() => {
    try {
      window.axio!.apply([
        {
          type: "construct",
          kind: "circular_segment",
          label: "bad",
          refs: ["c", "A", "O"],
        },
      ]);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(duplicate).toContain("nằm trên đường tròn");
  expect(
    await page.evaluate(() => window.axio!.adapter.api.exists("bad")),
  ).toBe(false);
});
test("phone fill dialog fits and can fill an existing circle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await ready(page);
  await page.getByRole("button", { name: "Tô vùng", exact: true }).click();
  const box = await page.locator(".region-dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(667);
  await page
    .getByLabel("Loại vùng tô", { exact: true })
    .selectOption("existing");
  await page.getByLabel("Đối tượng cần tô", { exact: true }).selectOption("c");
  await page.getByRole("button", { name: "Tô màu", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.axio!.objects.find((o) => o.name === "c")!.opacity,
    ),
  ).toBe(0.45);
});

test("filled region is selectable on canvas and minor regions stay minor across angle orientation changes", async ({
  page,
}) => {
  await ready(page);
  await fill(page);
  await page.evaluate(() => window.axio!.select(null));
  const p = await page.evaluate(() => {
    const api = window.axio!.adapter.api,
      v = JSON.parse(api.getViewProperties(1)),
      r = document
        .querySelector(".main-engine .EuclidianPanel")!
        .getBoundingClientRect();
    return {
      x: r.left + (2.6 - v.xMin) / v.invXscale,
      y: r.top + v.height - (2.6 - v.yMin) / v.invYscale,
    };
  });
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() => page.evaluate(() => window.axio!.selection))
    .toBe("region1");
  await expect(
    page.getByRole("slider", { name: "Độ đậm màu vùng", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.axio!.apply([{ type: "move", target: "B", x: 0, y: -4 }]),
  );
  const values = await pixels(page, [
    { x: 2.6, y: -2.6 },
    { x: 2.6, y: 2.6 },
    { x: 1, y: -1 },
  ]);
  expect(values[0][2]).toBeGreaterThan(values[0][0] + 40);
  expect(values[1]).toEqual([255, 255, 255]);
  expect(values[2]).toEqual([255, 255, 255]);
  await page.evaluate(() => window.axio!.mutate(() => { window.axio!.adapter.api.renameObject("A", "P"); }));
  await expect(page.locator(".inspector .definition")).toContainText("PB");
});

test("live assistant fills the circular segment through preview and apply", async ({
  page,
}, info) => {
  test.skip(
    process.env.RUN_LIVE_AI !== "1",
    "Uses the real configured DeepSeek API.",
  );
  test.setTimeout(180000);
  await ready(page);
  const { observeAgent, completedAgentReply } =
    await import("../helpers/agent");
  await observeAgent(page);
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill(
      "Tô màu xanh phần diện tích giữa cung nhỏ AB và dây AB trên đường tròn hiện có, như hình viên phân. Không tô tam giác OAB, giữ nguyên đường tròn.",
    );
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  const { plan } = await completedAgentReply(page, 0);
  expect(plan.status, plan.message).toBe("ready_to_preview");
  expect(
    plan.actions.some(
      (a) => a.type === "construct" && a.kind === "circular_segment",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  expect(
    await page.evaluate(() =>
      window.axio!.objects.some((o) => o.type === "arc"),
    ),
  ).toBe(false);
  await page.screenshot({ path: info.outputPath("ai-region-preview.png") });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.axio!.objects.filter(
            (o) => o.type === "arc" && (o.opacity ?? 0) > 0,
          ).length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getXML("c")),
  ).toContain('A2="-16"');
  const [cap, triangle] = await pixels(page, [
    { x: 2.6, y: 2.6 },
    { x: 1, y: 1 },
  ]);
  expect(cap).not.toEqual([255, 255, 255]);
  expect(triangle).toEqual([255, 255, 255]);
  await page.screenshot({ path: info.outputPath("ai-region-applied.png") });
  await info.attach("real-ai-plan", {
    body: JSON.stringify(plan, null, 2),
    contentType: "application/json",
  });
});
