import { test, expect, type Page } from "../fixtures";
import { readFile, mkdir } from "node:fs/promises";
async function enter(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Nhập phương trình" }).fill(text);
  await page.getByRole("button", { name: "Vẽ", exact: true }).click();
  await expect(page.locator("#equation-feedback[role=alert]")).toHaveCount(0);
}
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
}
async function exported(page: Page, extension: "png" | "svg", name: string) {
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name:
        extension === "png" ? "Ảnh PNG · độ phân giải 2×" : "Ảnh vector SVG",
      exact: true,
    })
    .click();
  const file = await waiting;
  await mkdir("axio-test-results/export-focus/downloads", { recursive: true });
  const path =
    "axio-test-results/export-focus/downloads/" + name + "." + extension;
  await file.saveAs(path);
  return path;
}
async function pixels(page: Page, path: string, mime: string) {
  const data = await readFile(path);
  return page.evaluate(
    async ({ data, mime }) => {
      const image = new Image();
      image.src = `data:${mime};base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let left = canvas.width,
        top = canvas.height,
        right = -1,
        bottom = -1,
        grid = 0,
        dark = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (
            pixels[i + 3] > 32 &&
            Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 225
          ) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            dark++;
          }
          if (
            pixels[i + 3] > 128 &&
            Math.abs(pixels[i] - 229) < 4 &&
            Math.abs(pixels[i + 1] - 240) < 4 &&
            Math.abs(pixels[i + 2] - 242) < 4
          )
            grid++;
        }
      return {
        width: canvas.width,
        height: canvas.height,
        left,
        top,
        right,
        bottom,
        dark,
        grid,
        margins: {
          left,
          top,
          right: canvas.width - 1 - right,
          bottom: canvas.height - 1 - bottom,
        },
      };
    },
    { data: data.toString("base64"), mime },
  );
}
test("exports a complete circle and distant point on white, tightly cropped in PNG and SVG", async ({
  page,
}, info) => {
  await ready(page);
  await enter(page, "A=(8,1)");
  await enter(page, "B=(-6,2)");
  await enter(page, "C=(-2,2)");
  await page.getByRole("button", { name: "ĐƯỜNG TRÒN", exact: true }).click();
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name: "Tâm và một điểm", exact: true })
    .click();
  for (const name of ["B", "C"]) {
    const q = await page.evaluate((n) => {
      const a = window.axio!.adapter.api,
        v = JSON.parse(a.getViewProperties(1)),
        r = document
          .querySelector(".main-engine .EuclidianPanel")!
          .getBoundingClientRect();
      return {
        x: r.left + (a.getXcoord(n) - v.xMin) / v.invXscale,
        y: r.top + v.height - (a.getYcoord(n) - v.yMin) / v.invYscale,
      };
    }, name);
    await page.mouse.click(q.x, q.y);
  }
  const circle = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    const n = a
      .getAllObjectNames()
      .find((n) => a.getObjectType(n) === "circle")!;
    return { name: n, xml: a.getXML(n) };
  });
  expect(circle.name).toBeTruthy();
  const before = await page.evaluate(() => ({
    view: JSON.parse(window.axio!.adapter.api.getViewProperties(1)),
    options: window.axio!.adapter.api.getGraphicsOptions(1),
  }));
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  await expect(
    page.getByLabel("Lưới trong ảnh", { exact: true }),
  ).not.toBeChecked();
  const facts = [];
  for (const extension of ["svg", "png"] as const) {
    const path = await exported(page, extension, "circle-focus");
    const image = await pixels(
      page,
      path,
      extension === "png" ? "image/png" : "image/svg+xml",
    );
    facts.push({ extension, ...image });
    if (extension === "svg") {
      const source = await readFile(path, "utf8");
      const curves = await page.evaluate((source) => {
        const host = document.createElement("div");
        host.style.cssText =
          "position:fixed;left:-10000px;top:0;pointer-events:none";
        host.innerHTML = source;
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!,
            v = svg.viewBox.baseVal;
          return Array.from(svg.querySelectorAll("path"))
            .filter(
              (p) =>
                /C/i.test(p.getAttribute("d") || "") &&
                p.getAttribute("stroke") !== "none",
            )
            .map((p) => {
              const b = p.getBBox();
              return {
                width: b.width,
                height: b.height,
                left: b.x - v.x,
                top: b.y - v.y,
                right: v.x + v.width - b.x - b.width,
                bottom: v.y + v.height - b.y - b.height,
              };
            })
            .filter((b) => b.width > 100 && b.height > 100);
        } finally {
          host.remove();
        }
      }, source);
      expect(curves.length).toBeGreaterThan(0);
      for (const curve of curves)
        for (const value of [curve.left, curve.top, curve.right, curve.bottom])
          expect(value).toBeGreaterThan(20);
    }
    await info.attach("actual-export-" + extension, {
      path,
      contentType: extension === "png" ? "image/png" : "image/svg+xml",
    });
    expect(image.dark).toBeGreaterThan(500);
    expect(image.grid).toBeLessThan(10);
    const padding = extension === "png" ? 48 : 24;
    for (const margin of Object.values(image.margins))
      expect(margin).toBeGreaterThanOrEqual(padding - 3);
    for (const margin of Object.values(image.margins))
      expect(margin).toBeLessThanOrEqual(padding + 3);
  }
  await page
    .getByRole("button", { name: "Đóng hộp thoại", exact: true })
    .click();
  const after = await page.evaluate(() => ({
    view: JSON.parse(window.axio!.adapter.api.getViewProperties(1)),
    options: window.axio!.adapter.api.getGraphicsOptions(1),
  }));
  expect(after.options).toEqual(before.options);
  for (const key of ["xMin", "yMin", "invXscale", "invYscale"])
    expect(Math.abs(after.view[key] - before.view[key])).toBeLessThan(1e-9);
  await info.attach("export-facts", {
    body: JSON.stringify({ circle, before, after, facts }, null, 2),
    contentType: "application/json",
  });
});

test("portrait geometry trims side whitespace, grid is opt-in, and current-view export remains available", async ({
  page,
}, info) => {
  await ready(page);
  for (const [n, x, y] of [
    ["A", 0, 0],
    ["B", 1, 0],
    ["C", 0, 6],
  ] as const)
    await enter(page, `${n}=(${x},${y})`);
  await page.getByRole("button", { name: "ĐA GIÁC", exact: true }).click();
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name: "Đa giác", exact: true })
    .click();
  for (const name of ["A", "B", "C", "A"]) {
    const q = await page.evaluate((n) => {
      const a = window.axio!.adapter.api,
        v = JSON.parse(a.getViewProperties(1)),
        r = document
          .querySelector(".main-engine .EuclidianPanel")!
          .getBoundingClientRect();
      return {
        x: r.left + (a.getXcoord(n) - v.xMin) / v.invXscale,
        y: r.top + v.height - (a.getYcoord(n) - v.yMin) / v.invYscale,
      };
    }, name);
    await page.mouse.click(q.x, q.y);
  }
  const before = await page.evaluate(() => ({
    view: JSON.parse(window.axio!.adapter.api.getViewProperties(1)),
    state: window.axio!.adapter.viewState(),
  }));
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  const plain = await exported(page, "png", "portrait-no-grid");
  const plainFacts = await pixels(page, plain, "image/png");
  expect(plainFacts.width / plainFacts.height).toBeLessThan(0.4);
  expect(plainFacts.grid).toBeLessThan(10);
  await page.getByLabel("Lưới trong ảnh", { exact: true }).check();
  const grid = await exported(page, "png", "portrait-with-grid");
  const gridFacts = await pixels(page, grid, "image/png");
  expect(gridFacts.grid).toBeGreaterThan(500);
  expect(gridFacts.width).toBe(plainFacts.width);
  expect(gridFacts.height).toBe(plainFacts.height);
  await page.getByLabel("Căn giữa hình khi xuất", { exact: true }).uncheck();
  await page.getByLabel("Lưới trong ảnh", { exact: true }).uncheck();
  const current = await exported(page, "png", "portrait-current-view");
  const currentFacts = await pixels(page, current, "image/png");
  expect(currentFacts.width).toBe(before.view.width * 2);
  expect(currentFacts.height).toBe(before.view.height * 2);
  await page
    .getByRole("button", { name: "Đóng hộp thoại", exact: true })
    .click();
  const after = await page.evaluate(() => ({
    view: JSON.parse(window.axio!.adapter.api.getViewProperties(1)),
    state: window.axio!.adapter.viewState(),
  }));
  expect(after.state.grid).toBe(before.state.grid);
  for (const key of ["xMin", "yMin", "invXscale", "invYscale"])
    expect(Math.abs(after.view[key] - before.view[key])).toBeLessThan(1e-9);
  for (const [name, path] of [
    ["portrait", plain],
    ["grid-opt-in", grid],
    ["current-view", current],
  ])
    await info.attach(name, { path, contentType: "image/png" });
  await info.attach("export-facts", {
    body: JSON.stringify(
      { plainFacts, gridFacts, currentFacts, before, after },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("coordinate exports retain native axes and point labels without importing the editor grid", async ({
  page,
}, info) => {
  await ready(page);
  await enter(page, "A=(2,3)");
  await page
    .getByRole("button", { name: "Ẩn / hiện trục tọa độ", exact: true })
    .click();
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  await expect(
    page.getByLabel("Trục tọa độ trong ảnh", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Lưới trong ảnh", { exact: true }),
  ).not.toBeChecked();
  const path = await exported(page, "svg", "coordinate-focus");
  const source = await readFile(path, "utf8");
  const text = await page.evaluate(
    (source) =>
      Array.from(
        new DOMParser()
          .parseFromString(source, "image/svg+xml")
          .querySelectorAll("text"),
      ).map((n) => n.textContent),
    source,
  );
  expect(text).toContain("x");
  expect(text).toContain("y");
  expect(text).toContain("0");
  expect(text.some((s) => /A\s*=\s*\(2,\s*3\)/.test(s || ""))).toBe(true);
  expect((await pixels(page, path, "image/svg+xml")).grid).toBeLessThan(10);
  await info.attach("coordinate-svg", { path, contentType: "image/svg+xml" });
});

test("copying an image to the real clipboard uses the same white cropped output", async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page);
  await enter(page, "A=(0,0)");
  await enter(page, "B=(1,6)");
  await page.getByRole("button", { name: "Chia sẻ", exact: true }).click();
  await expect(
    page.getByLabel("Lưới trong ảnh", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Chép ảnh vào clipboard", exact: true })
    .click();
  await expect(
    page.getByText("Đã chép ảnh. Bạn có thể dán vào tin nhắn.", {
      exact: true,
    }),
  ).toBeVisible();
  const actual = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((i) => i.types.includes("image/png"));
    if (!item) throw Error("No PNG on clipboard");
    const blob = await item.getType("image/png");
    const image = await createImageBitmap(blob);
    return { width: image.width, height: image.height, bytes: blob.size };
  });
  expect(actual.bytes).toBeGreaterThan(100);
  expect(actual.width / actual.height).toBeLessThan(0.4);
  await info.attach("real-clipboard-image-facts", {
    body: JSON.stringify(actual),
    contentType: "application/json",
  });
});
