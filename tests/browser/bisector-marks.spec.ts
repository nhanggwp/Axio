import { test, expect, type Page } from "../fixtures";
import { readFile, mkdir, writeFile } from "node:fs/promises";
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Đóng bảng trợ lý AI" }).click();
  for (const text of ["A=(-2,-1)", "B=(2,-1)", "C=(-0.5,2)"]) {
    await page.getByRole("textbox", { name: "Nhập phương trình" }).fill(text);
    await page.getByRole("button", { name: "Vẽ", exact: true }).click();
  }
  await page.getByRole("button", { name: "ĐA GIÁC", exact: true }).click();
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name: "Đa giác", exact: true })
    .click();
  for (const name of ["A", "B", "C", "A"]) {
    const q = await pointScreen(page, name);
    await page.mouse.click(q.x, q.y);
  }
}
async function pointScreen(page: Page, name: string) {
  return page.evaluate((n) => {
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
}
async function nativeBisector(page: Page) {
  await page.getByRole("button", { name: "DỰNG HÌNH", exact: true }).click();
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name: "Đường phân giác", exact: true })
    .click();
  for (const name of ["B", "A", "C"]) {
    const q = await pointScreen(page, name);
    await page.mouse.click(q.x, q.y);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => window.axio!.adapter.api.getAllObjectNames("angle").length,
      ),
    )
    .toBe(2);
}
async function assertMarks(page: Page) {
  const result = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    const vertex = { x: a.getXcoord("A"), y: a.getYcoord("A") },
      u = { x: a.getXcoord("B") - vertex.x, y: a.getYcoord("B") - vertex.y },
      v = { x: a.getXcoord("C") - vertex.x, y: a.getYcoord("C") - vertex.y };
    return {
      expected:
        Math.acos(
          (u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y),
        ) / 2,
      angles: a.getAllObjectNames("angle").map((n) => ({
        name: n,
        visible: a.getVisible(n),
        value: a.getValue(n),
        xml: a.getXML(n),
        defined: a.isDefined(n),
        command: a.getCommandString(n, false),
      })),
    };
  });
  expect(result.angles).toHaveLength(2);
  for (const angle of result.angles) {
    expect(angle.visible).toBe(true);
    expect(angle.defined).toBe(true);
    expect(angle.value).toBeCloseTo(result.expected, 8);
    expect(angle.xml).toMatch(/<decoration[^>]*type="3"/);
    expect(angle.xml).toMatch(/<show[^>]*label="false"/);
    expect(angle.command).toMatch(/^Angle/);
  }
  return result;
}
test("toolbar bisector adds two native equal-angle marks that follow dragging and orientation changes", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await nativeBisector(page);
  const before = await assertMarks(page);
  await page.getByRole("button", { name: "DI CHUYỂN", exact: true }).click();
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name: "Chọn / Di chuyển", exact: true })
    .click();
  const q = await pointScreen(page, "C");
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.mouse.move(q.x + 35, q.y + 40, { steps: 20 });
  await page.mouse.up();
  const after = await assertMarks(page);
  expect(after.expected).not.toBeCloseTo(before.expected, 3);
  await page
    .getByRole("textbox", { name: "Nhập phương trình" })
    .fill("C=(-0.5,-3)");
  await page.getByRole("button", { name: "Vẽ", exact: true }).click();
  const flipped = await assertMarks(page);
  expect(errors).toEqual([]);
  await info.attach("native-mark-facts", {
    body: JSON.stringify({ before, after, flipped }, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("equal-angle-marks.png") });
});

test("marks share bisector undo/redo, survive save/load, stay when its long line is hidden, and delete with it", async ({
  page,
}, info) => {
  await ready(page);
  await nativeBisector(page);
  await assertMarks(page);
  const names = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    return {
      line: a
        .getAllObjectNames("line")
        .find((n) => /Bisector/.test(a.getCommandString(n, false)))!,
      angles: a.getAllObjectNames("angle"),
    };
  });
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.axio!.adapter.api.getAllObjectNames("angle").length,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await assertMarks(page);
  await page
    .getByRole("button", { name: "Ẩn " + names.line, exact: true })
    .click();
  await assertMarks(page);
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await expect(page.locator(".session-loading")).toBeHidden();
  await assertMarks(page);
  expect(
    await page.evaluate(
      () => window.axio!.adapter.api.getAllObjectNames("angle").length,
    ),
  ).toBe(2);
  // Real editable file roundtrip, distinct from local-session persistence.
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Tải xuống .ggb · chỉnh sửa được",
      exact: true,
    })
    .click();
  const file = await waiting;
  await mkdir("axio-test-results/bisector-marks/downloads", {
    recursive: true,
  });
  const path = "axio-test-results/bisector-marks/downloads/marked-bisector.ggb";
  await file.saveAs(path);
  await page
    .getByRole("button", { name: "Đóng hộp thoại", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tạo phiên mới", exact: true })
    .click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.locator(".document-title").click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Mở tệp .ggb từ máy", exact: true })
    .click();
  await (await chooser).setFiles(path);
  await expect(
    page.getByRole("dialog", { name: "Lưu và mở", exact: true }),
  ).toBeHidden();
  await assertMarks(page);
  await page
    .getByRole("button", { name: "Hiện " + names.line, exact: true })
    .click();
  const lineRow = page
    .locator(".explorer")
    .getByRole("button", { name: new RegExp("^" + names.line + " ") });
  await lineRow.click();
  await page
    .getByRole("button", { name: "Xóa đối tượng", exact: true })
    .click();
  const deletion = page.getByRole("dialog", { name: "Xác nhận xóa đối tượng" });
  if (await deletion.isVisible())
    await deletion
      .getByRole("button", { name: "Xóa và các hình phụ thuộc", exact: true })
      .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.axio!.adapter.api.getAllObjectNames("angle").length,
      ),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await assertMarks(page);
  await info.attach("editable-native-file", {
    path,
    contentType: "application/vnd.geogebra.file",
  });
});

test("AI execution and preview add paired marks while multiple bisectors use distinct equal-angle symbols", async ({
  page,
}, info) => {
  await ready(page);
  // Exercise the production executor used by AI previews, without a provider mock.
  await page.evaluate(async () => {
    const modulePath = "/src/geometry/CommandExecutor.ts";
    const { executeActions } = await import(modulePath);
    executeActions(window.axio!.adapter, [
      {
        type: "construct",
        kind: "angle_bisector",
        label: "d",
        refs: ["B", "A", "C"],
      },
    ]);
  });
  await assertMarks(page);
  await page.evaluate(() =>
    window.axio!.apply([
      {
        type: "construct",
        kind: "angle_bisector",
        label: "e",
        refs: ["A", "B", "C"],
      },
      {
        type: "construct",
        kind: "angle_bisector",
        label: "f",
        refs: ["A", "C", "B"],
      },
    ]),
  );
  const angles = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    return a.getAllObjectNames("angle").map((n) => ({
      name: n,
      value: a.getValue(n),
      color: a.getColor(n),
      decoration: new DOMParser()
        .parseFromString(a.getXML(n), "application/xml")
        .querySelector("decoration")
        ?.getAttribute("type"),
      command: a.getCommandString(n, false),
    }));
  });
  expect(angles).toHaveLength(6);
  const groups = new Map<string, number[]>();
  for (const a of angles) {
    const key = a.color + ":" + a.decoration;
    groups.set(key, [...(groups.get(key) || []), a.value]);
  }
  expect(groups.size).toBe(3);
  for (const values of groups.values()) {
    expect(values).toHaveLength(2);
    expect(values[0]).toBeCloseTo(values[1], 8);
  }
  const before = angles.map((a) => a.name);
  await page.evaluate(() => window.axio!.sync());
  expect(
    await page.evaluate(() =>
      window.axio!.adapter.api.getAllObjectNames("angle"),
    ),
  ).toEqual(before);
  await info.attach("three-distinct-equality-groups", {
    body: JSON.stringify(angles, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("three-bisectors.png") });
});

test("exported SVG includes the two real equality marks without degree labels", async ({
  page,
}, info) => {
  await ready(page);
  await nativeBisector(page);
  const marks = await assertMarks(page);
  const line = await page.evaluate(() => {
    const a = window.axio!.adapter.api;
    return a
      .getAllObjectNames("line")
      .find((n) => /Bisector/.test(a.getCommandString(n, false)))!;
  });
  await page.getByRole("button", { name: "Ẩn " + line, exact: true }).click();
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  let waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Ảnh vector SVG", exact: true })
    .click();
  let file = await waiting;
  await mkdir("axio-test-results/bisector-marks/downloads", {
    recursive: true,
  });
  const marked =
    "axio-test-results/bisector-marks/downloads/equal-angle-marks.svg";
  await file.saveAs(marked);
  await page
    .getByRole("button", { name: "Đóng hộp thoại", exact: true })
    .click();
  for (const angle of marks.angles)
    await page
      .getByRole("button", { name: "Ẩn " + angle.name, exact: true })
      .click();
  await page.getByRole("button", { name: "Xuất", exact: true }).click();
  waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Ảnh vector SVG", exact: true })
    .click();
  file = await waiting;
  const plain = "axio-test-results/bisector-marks/downloads/without-marks.svg";
  await file.saveAs(plain);
  const markedSVG = await readFile(marked, "utf8"),
    plainSVG = await readFile(plain, "utf8");
  const facts = await page.evaluate(
    ({ markedSVG, plainSVG }) => {
      const parse = (s: string) => {
        const doc = new DOMParser().parseFromString(s, "image/svg+xml");
        return {
          paths: doc.querySelectorAll("path").length,
          text: Array.from(doc.querySelectorAll("text")).map(
            (n) => n.textContent,
          ),
        };
      };
      return { marked: parse(markedSVG), plain: parse(plainSVG) };
    },
    { markedSVG, plainSVG },
  );
  expect(facts.marked.paths).toBeGreaterThan(facts.plain.paths + 2);
  expect(facts.marked.text.some((s) => /°|\d/.test(s || ""))).toBe(false);
  await info.attach("exported-equal-angle-marks", {
    path: marked,
    contentType: "image/svg+xml",
  });
  await info.attach("export-facts", {
    body: JSON.stringify(facts, null, 2),
    contentType: "application/json",
  });
});

test("opening an older file adds marks to a hidden bisector represented by its visible segment", async ({
  page,
}) => {
  await ready(page);
  await nativeBisector(page);
  // Generate a real legacy native-file fixture without annotation helpers.
  const legacy = await page.evaluate(async () => {
    const c = window.axio!,
      a = c.adapter.api;
    const line = a
      .getAllObjectNames("line")
      .find((n) => /Bisector/.test(a.getCommandString(n, false)))!;
    const edge = c.objects.find(
      (o) => o.type === "segment" && o.displayName === "BC",
    )!.name;
    c.apply([
      {
        type: "construct",
        kind: "intersection",
        label: "D",
        refs: [line, edge],
      },
      { type: "construct", kind: "segment", label: "AD", refs: ["A", "D"] },
      { type: "style", target: line, visible: false },
    ]);
    const helper = a
      .getAllObjectNames("point")
      .find((n) => a.getCaption(n, false) === "Axio: angle-bisector marks v1")!;
    c.dispose();
    a.deleteObject(helper);
    if (a.getAllObjectNames("angle").length)
      throw Error("Legacy fixture still has marks");
    return {
      line,
      data: await new Promise<string>((resolve) => a.getBase64(resolve)),
    };
  });
  await mkdir("axio-test-results/bisector-marks/downloads", {
    recursive: true,
  });
  const path =
    "axio-test-results/bisector-marks/downloads/legacy-unmarked-bisector.ggb";
  await writeFile(path, Buffer.from(legacy.data, "base64"));
  await page.reload();
  await page.waitForFunction(() => !!window.axio, undefined, {
    timeout: 60000,
  });
  await expect(page.locator(".session-loading")).toBeHidden();
  await page
    .getByRole("button", { name: "Tạo phiên mới", exact: true })
    .click();
  await expect(page.locator(".session-loading")).toBeHidden();
  await page.locator(".document-title").click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Mở tệp .ggb từ máy", exact: true })
    .click();
  await (await chooser).setFiles(path);
  await expect(
    page.getByRole("dialog", { name: "Lưu và mở", exact: true }),
  ).toBeHidden();
  await assertMarks(page);
  expect(
    await page.evaluate(
      (n) => window.axio!.adapter.api.getVisible(n),
      legacy.line,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => window.axio!.adapter.api.getVisible("AD")),
  ).toBe(true);
});
