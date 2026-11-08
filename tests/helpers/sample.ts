import type { Page } from "@playwright/test";
import type { GeometryAction } from "../../shared/actions";
/** Test fixture for geometry, selection and persistence checks. */
export const rightTriangleExample: GeometryAction[] = [
  { type: "point", label: "A", x: 0, y: 0 },
  { type: "point", label: "B", x: 3, y: 0 },
  { type: "point", label: "C", x: 0, y: 4 },
  { type: "construct", kind: "polygon", label: "ABC", refs: ["A", "B", "C"] },
  { type: "construct", kind: "segment", label: "AB", refs: ["A", "B"] },
  { type: "construct", kind: "segment", label: "BC", refs: ["B", "C"] },
  { type: "construct", kind: "segment", label: "AC", refs: ["C", "A"] },
  { type: "altitude", vertex: "A", base: "BC", foot: "H", label: "AH" },
  {
    type: "construct",
    kind: "circumcircle",
    label: "cABC",
    refs: ["A", "B", "C"],
  },
];

export async function seedTriangle(page: Page) {
  await page.locator(".session-loading").waitFor({ state: "hidden" });
  await page.evaluate((actions) => {
    window.axio!.apply(actions);
    window.axio!.adapter.resetView();
  }, rightTriangleExample);
}
