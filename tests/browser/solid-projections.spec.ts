import type { GGBApi } from "../../src/types/geogebra";
import { test, expect, type Page } from "../fixtures";
const shapes = [
  {
    name: "Hình hộp chữ nhật",
    kind: "cuboid",
    vertices: 8,
    edges: 12,
    faces: 6,
  },
  { name: "Hình lập phương", kind: "cube", vertices: 8, edges: 12, faces: 6 },
  {
    name: "Lăng trụ đứng tam giác",
    kind: "triangular_prism",
    vertices: 6,
    edges: 9,
    faces: 5,
  },
  {
    name: "Lăng trụ đứng tứ giác",
    kind: "quadrilateral_prism",
    vertices: 8,
    edges: 12,
    faces: 6,
  },
] as const;
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
}
async function insert(page: Page, name: string) {
  await page
    .getByRole("button", { name: "HÌNH KHÔNG GIAN", exact: true })
    .click();
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name, exact: true })
    .click();
}
for (const shape of shapes)
  test(`${shape.name}: native projected vertices, linked faces and automatic hidden edges`, async ({
    page,
  }, info) => {
    await ready(page);
    await insert(page, shape.name);
    const state = await page.evaluate(() => {
      const root = window.axio!.objects.find((o) => o.solid)!;
      return {
        root,
        points: window.axio!.objects.filter((o) => o.type === "point").length,
        edges: window
          .axio!.objects.filter((o) => o.type === "segment")
          .map((o) => ({
            name: o.name,
            visible: o.visible,
            style: o.lineStyle,
            label: o.labelVisible,
          })),
        faces: window
          .axio!.objects.filter((o) =>
            ["triangle", "quadrilateral", "polygon"].includes(o.type),
          )
          .map((o) => ({
            name: o.name,
            opacity: o.opacity,
            thickness: o.thickness,
          })),
      };
    });
    expect(state.root.solid!.kind).toBe(shape.kind);
    expect(state.points).toBe(shape.vertices);
    expect(state.edges).toHaveLength(shape.edges);
    expect(state.faces).toHaveLength(shape.faces);
    expect(state.edges.every((e) => e.visible && !e.label)).toBe(true);
    expect(state.edges.some((e) => e.style === 1)).toBe(true);
    expect(state.edges.some((e) => e.style === 0)).toBe(true);
    expect(state.faces.every((f) => f.opacity === 0)).toBe(true);
    await page.evaluate(() => window.axio!.select(null));
    await page.screenshot({ path: info.outputPath(shape.kind + ".png") });
    const invariants = await page.evaluate(() => {
      const api = window.axio!.adapter.api,
        s = window.axio!.objects.find((o) => o.solid)!.solid!,
        n = s.vertices.length / 2;
      return Array.from({ length: n }, (_, i) => ({
        dx: api.getXcoord(s.vertices[i + n]) - api.getXcoord(s.vertices[i]),
        dy: api.getYcoord(s.vertices[i + n]) - api.getYcoord(s.vertices[i]),
      }));
    });
    for (const p of invariants) {
      expect(p.dx).toBeCloseTo(invariants[0].dx, 8);
      expect(p.dy).toBeCloseTo(invariants[0].dy, 8);
    }
    await page.evaluate(() => window.axio!.undo());
    expect(await page.evaluate(() => window.axio!.objects.length)).toBe(0);
    await page.evaluate(() => window.axio!.redo());
    expect(
      await page.evaluate(
        () => window.axio!.objects.filter((o) => o.type === "segment").length,
      ),
    ).toBe(shape.edges);
  });
test("dragging depth changes hidden edges, preserves parallel extrusion, and export retains dashes and face fill", async ({
  page,
}, info) => {
  await ready(page);
  await insert(page, "Hình hộp chữ nhật");
  const before = await page.evaluate(
    () => window.axio!.objects.find((o) => o.solid)!.solid!,
  );
  expect(before.hiddenEdges).toHaveLength(3);
  // A genuine pointer drag changes the projection direction without creating free copies.
  const location = await page.evaluate(() => {
    const a = window.axio!.adapter.api,
      s = window.axio!.objects.find((o) => o.solid)!.solid!,
      name = s.vertices[3],
      origin = s.vertices[0],
      v = JSON.parse(a.getViewProperties(1)),
      r = document
        .querySelector(".main-engine .EuclidianPanel")!
        .getBoundingClientRect();
    return {
      x: r.left + (a.getXcoord(name) - v.xMin) / v.invXscale,
      y: r.top + v.height - (a.getYcoord(name) - v.yMin) / v.invYscale,
      tx: r.left + (a.getXcoord(origin) - 2 - v.xMin) / v.invXscale,
      ty: r.top + v.height - (a.getYcoord(origin) + 1 - v.yMin) / v.invYscale,
    };
  });
  await page.mouse.move(location.x, location.y);
  await page.mouse.down();
  await page.mouse.move(location.tx, location.ty, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.axio!.objects.find((o) => o.solid)!.solid!.hiddenEdges.join(","),
      ),
    )
    .not.toBe(before.hiddenEdges.join(","));
  const after = await page.evaluate(
    () => window.axio!.objects.find((o) => o.solid)!.solid!,
  );
  expect(after.hiddenEdges).toHaveLength(3);
  await page.evaluate(() => {
    const c = window.axio!,
      s = c.objects.find((o) => o.solid)!.solid!;
    c.apply([
      { type: "style", target: s.faces[1], color: "#09AFF0", opacity: 0.45 },
    ]);
    c.select(null);
  });
  const svg = await page.evaluate(() => window.axio!.adapter.exportSVG());
  expect(svg).toContain("stroke-dasharray");
  expect(svg).toMatch(/(?:#09aff0|rgb\(9,\s*175,\s*240\))/i);
  await info.attach("solid.svg", { body: svg, contentType: "image/svg+xml" });
  const png = await page.evaluate(() => window.axio!.adapter.exportPNG());
  await info.attach("solid.png", {
    body: Buffer.from(png, "base64"),
    contentType: "image/png",
  });
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(
    await page.evaluate(
      () => window.axio!.objects.find((o) => o.solid)!.solid!.hiddenEdges,
    ),
  ).toEqual(after.hiddenEdges);
});
test("multiple solids use distinct labels and deleting a group removes its own vertices, edges and faces", async ({
  page,
}) => {
  await ready(page);
  await insert(page, "Hình lập phương");
  await insert(page, "Lăng trụ đứng tam giác");
  const groups = await page.evaluate(() =>
    window
      .axio!.objects.filter((o) => o.solid)
      .map((o) => ({ name: o.name, vertices: o.solid!.vertices })),
  );
  expect(groups).toHaveLength(2);
  expect(new Set(groups.flatMap((g) => g.vertices)).size).toBe(14);
  await page.evaluate((name) => {
    window.axio!.select(name);
    window.axio!.deleteSelection();
  }, groups[0].name);
  expect(
    await page.evaluate(
      () => window.axio!.objects.filter((o) => o.type === "point").length,
    ),
  ).toBe(6);
  expect(
    await page.evaluate(
      () => window.axio!.objects.filter((o) => o.type === "segment").length,
    ),
  ).toBe(9);
  await page.evaluate(() => window.axio!.undo());
  expect(
    await page.evaluate(
      () => window.axio!.objects.filter((o) => o.solid).length,
    ),
  ).toBe(2);
});

test("space mode toggle genuinely switches occluded edges between dashed and solid and persists across reload", async ({
  page,
}, info) => {
  await ready(page);
  await expect(
    page.getByRole("button", {
      name: "Bật / tắt chế độ hình không gian",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  await insert(page, "Hình lập phương");
  await page
    .getByRole("button", { name: "HÌNH KHÔNG GIAN", exact: true })
    .click();
  const mode = page.getByRole("button", {
    name: "Chế độ không gian",
    exact: true,
  });
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate(() =>
      window
        .axio!.objects.filter((o) => o.type === "segment")
        .every((o) => o.lineStyle === 0),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Bật / tắt chế độ hình không gian",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  const flat = await page.evaluate(() => window.axio!.adapter.exportSVG());
  expect(flat).not.toContain("stroke-dasharray");
  await page
    .getByRole("button", {
      name: "Bật / tắt chế độ hình không gian",
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(
      () =>
        window.axio!.objects.filter(
          (o) => o.type === "segment" && o.lineStyle === 1,
        ).length,
    ),
  ).toBe(3);
  await page.screenshot({ path: info.outputPath("space-mode-on.png") });
  await expect(page.locator(".session-save-status")).toHaveText(
    "Đã lưu phiên cục bộ",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tạo phiên mới", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByRole("button", {
      name: "Bật / tắt chế độ hình không gian",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () =>
        window.axio!.objects.filter(
          (o) => o.type === "segment" && o.lineStyle === 1,
        ).length,
    ),
  ).toBe(3);
});

test("explicit solid dimensions label real lengths rather than foreshortened screen lengths", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() =>
    window.axio!.apply([
      {
        type: "solid",
        kind: "cube",
        label: "cube1",
        dimensions: { width: 5, depth: 5, height: 5 },
        scale: 0.5,
        showDimensions: true,
      },
    ]),
  );
  const values = await page.evaluate(() => {
    const c = window.axio!,
      s = c.objects.find((o) => o.solid)!.solid!,
      a = c.adapter.api;
    return s.edges
      .filter((n) => /<show[^>]*label="true"/.test(a.getXML(n)))
      .map((n) => ({
        name: n,
        caption: a.getCaption(n, true),
        projected: a.getValue(n),
      }));
  });
  expect(values).toHaveLength(3);
  expect(values.every((v) => v.caption.endsWith(" = 5"))).toBe(true);
  expect(values.some((v) => Math.abs(v.projected - 5) > 1)).toBe(true);
  await page
    .getByRole("button", { name: "Ẩn / hiện số đo", exact: true })
    .click();
  expect(await page.evaluate(() => window.axio!.measurementsVisible)).toBe(
    false,
  );
  const xml = await page.evaluate(() => window.axio!.adapter.snapshot());
  const error = await page.evaluate(() => {
    try {
      window.axio!.apply([
        {
          type: "solid",
          kind: "cube",
          label: "bad",
          dimensions: { width: 3, depth: 4, height: 3 },
        },
      ]);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(error).toContain("bằng nhau");
  expect(await page.evaluate(() => window.axio!.adapter.snapshot())).toBe(xml);
});

test("phone quick-draw section and space switch fit; real face controls fill only that face", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await ready(page);
  await page
    .getByRole("button", { name: "HÌNH KHÔNG GIAN", exact: true })
    .click();
  const flyout = await page.locator(".tool-flyout").boundingBox();
  expect(flyout!.x).toBeGreaterThanOrEqual(0);
  expect(flyout!.x + flyout!.width).toBeLessThanOrEqual(375);
  expect(flyout!.y + flyout!.height).toBeLessThanOrEqual(667);
  await page.screenshot({ path: info.outputPath("phone-quick-solids.png") });
  await page
    .locator(".tool-flyout")
    .getByRole("button", { name: "Hình lập phương", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Bật / tắt chế độ hình không gian",
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(() =>
      window
        .axio!.objects.filter((o) => o.type === "segment")
        .every((o) => o.lineStyle === 0),
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Bật / tắt chế độ hình không gian",
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(
      () =>
        window.axio!.objects.filter(
          (o) => o.type === "segment" && o.lineStyle === 1,
        ).length,
    ),
  ).toBe(3);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".explorer")).toBeVisible();
  const rootName = await page.evaluate(
    () => window.axio!.objects.find((o) => o.solid)!.name,
  );
  await page
    .locator(".explorer .object-value")
    .filter({ hasText: "Hình lập phương" })
    .click();
  await expect(page.locator(".solid-face-list button")).toHaveCount(6);
  await page.locator(".solid-face-list button").nth(1).click();
  await page
    .getByRole("slider", { name: "Độ đậm màu vùng", exact: true })
    .fill("45");
  const states = await page.evaluate((name) => {
    const c = window.axio!,
      s = c.objects.find((o) => o.name === name)!.solid!;
    return {
      faces: s.faces.map((n) => c.objects.find((o) => o.name === n)!.opacity),
      edges: s.edges.map((n) => c.objects.find((o) => o.name === n)!.lineStyle),
    };
  }, rootName);
  expect(states.faces.filter((v) => v === 0.45)).toHaveLength(1);
  expect(states.edges.filter((v) => v === 1)).toHaveLength(3);
});

test("live assistant draws a projected cuboid and can turn off its space mode through preview/apply", async ({
  page,
}, info) => {
  test.skip(
    process.env.RUN_LIVE_AI !== "1",
    "Uses the configured DeepSeek API.",
  );
  test.setTimeout(240000);
  await ready(page);
  const { observeAgent, completedAgentReply } =
    await import("../helpers/agent");
  await observeAgent(page);
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill(
      "Vẽ nhanh hình hộp chữ nhật ABCD.A'B'C'D' biểu diễn trên mặt phẳng, cạnh khuất nét đứt, chưa cần số đo.",
    );
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  const first = await completedAgentReply(page, 0);
  expect(first.plan.status, first.plan.message).toBe("ready_to_preview");
  expect(
    first.plan.actions.some((a) => a.type === "solid" && a.kind === "cuboid"),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const styles = await page
    .locator(".preview-engine .engine")
    .evaluate((node) => {
      const scope = window as unknown as Record<string, GGBApi>,
        a = scope[node.id];
      return a.getAllObjectNames("segment").map((n) => a.getLineStyle(n));
    });
  expect(styles.filter((s) => s === 1)).toHaveLength(3);
  expect(styles.filter((s) => s === 0)).toHaveLength(9);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.axio!.objects.filter((o) => o.type === "solid").length,
      ),
    )
    .toBe(1);
  await page
    .getByRole("textbox", { name: "Yêu cầu hình học" })
    .fill("Tắt chế độ không gian, cho tất cả cạnh nét liền. Giữ nguyên hình.");
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  const second = await completedAgentReply(page, first.nextIndex);
  expect(second.plan.status, second.plan.message).toBe("ready_to_preview");
  expect(second.plan.actions).toContainEqual({
    type: "space_mode",
    enabled: false,
  });
  await expect(
    page.getByRole("button", { name: "Áp dụng", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  expect(await page.evaluate(() => window.axio!.spaceMode)).toBe(false);
  expect(
    await page.evaluate(() =>
      window
        .axio!.objects.filter((o) => o.type === "segment")
        .every((o) => o.lineStyle === 0),
    ),
  ).toBe(true);
  await info.attach("real-solid-plans", {
    body: JSON.stringify([first.plan, second.plan], null, 2),
    contentType: "application/json",
  });
});
