import type { GeometryAction } from "../../shared/actions";
import type { GGBApi } from "../types/geogebra";
import type { GeometryController } from "./GeometryController";

export type PolygonPresetId =
  | "triangle"
  | "right_triangle"
  | "isosceles_triangle"
  | "equilateral_triangle"
  | "square"
  | "rectangle"
  | "parallelogram"
  | "rhombus"
  | "trapezoid"
  | "isosceles_trapezoid"
  | "pentagon"
  | "hexagon"
  | "octagon";

export const polygonPresets: readonly {
  id: PolygonPresetId;
  label: string;
  hint: string;
}[] = [
  { id: "triangle", label: "Tam giác thường", hint: "Đã tạo tam giác thường · kéo đỉnh hoặc khung bao để co giãn." },
  { id: "right_triangle", label: "Tam giác vuông", hint: "Đã tạo tam giác vuông · giữ góc vuông động khi kéo đỉnh và co giãn." },
  { id: "isosceles_triangle", label: "Tam giác cân", hint: "Đã tạo tam giác cân · hai cạnh bên luôn bằng nhau khi kéo chỉnh." },
  { id: "equilateral_triangle", label: "Tam giác đều", hint: "Đã tạo tam giác đều · ba cạnh luôn bằng nhau khi co giãn." },
  { id: "square", label: "Hình vuông", hint: "Đã tạo hình vuông · giữ 4 cạnh bằng nhau và 4 góc vuông." },
  { id: "rectangle", label: "Hình chữ nhật", hint: "Đã tạo hình chữ nhật · kéo khung hoặc đỉnh để đổi dài/rộng." },
  { id: "parallelogram", label: "Hình bình hành", hint: "Đã tạo hình bình hành · các cặp cạnh đối luôn song song." },
  { id: "rhombus", label: "Hình thoi", hint: "Đã tạo hình thoi · bốn cạnh luôn bằng nhau." },
  { id: "trapezoid", label: "Hình thang", hint: "Đã tạo hình thang · hai đáy luôn song song." },
  { id: "isosceles_trapezoid", label: "Hình thang cân", hint: "Đã tạo hình thang cân · hai đáy song song và hai cạnh bên bằng nhau." },
  { id: "pentagon", label: "Ngũ giác đều", hint: "Đã tạo ngũ giác đều 5 cạnh · kéo khung bao để phóng to/thu nhỏ." },
  { id: "hexagon", label: "Lục giác đều", hint: "Đã tạo lục giác đều 6 cạnh · kéo khung bao để phóng to/thu nhỏ." },
  { id: "octagon", label: "Bát giác đều", hint: "Đã tạo bát giác đều 8 cạnh · kéo khung bao để phóng to/thu nhỏ." },
] as const;

function allocatePointLabels(api: GGBApi, count: number): string[] {
  const used = new Set(api.getAllObjectNames());
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const result: string[] = [];
  for (let suffix = 0; result.length < count; suffix++) {
    for (const ch of alphabet) {
      const candidate = suffix === 0 ? ch : `${ch}_${suffix}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        result.push(candidate);
        if (result.length === count) break;
      }
    }
  }
  return result;
}

function allocateAuxLabel(api: GGBApi, prefix: string, reserved: Set<string>): string {
  const used = new Set([...api.getAllObjectNames(), ...reserved]);
  let idx = 1;
  while (used.has(`${prefix}${idx}`)) idx++;
  const name = `${prefix}${idx}`;
  reserved.add(name);
  return name;
}

export function insertPolygonPreset(
  controller: GeometryController,
  presetId: PolygonPresetId,
): string {
  const api = controller.adapter.api;
  const v = JSON.parse(api.getViewProperties(1)) as {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
    invXscale: number;
    invYscale: number;
  };
  const spanX = v.width * v.invXscale;
  const spanY = v.height * v.invYscale;
  const r = (n: number) => Number(n.toFixed(2));
  const cx = r(v.xMin + spanX / 2);
  const cy = r(v.yMin + spanY / 2);
  const u = r(Math.max(1.2, Math.min(spanX, spanY) * 0.16));

  const reserved = new Set<string>();
  const aux = (prefix: string) => allocateAuxLabel(api, prefix, reserved);
  const actions: GeometryAction[] = [];
  let polyLabel = "";

  if (presetId === "triangle") {
    const [A, B, C] = allocatePointLabels(api, 3);
    reserved.add(A); reserved.add(B); reserved.add(C);
    polyLabel = !api.exists(`${A}${B}${C}`) ? `${A}${B}${C}` : aux("poly");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 1.1), y: r(cy - u * 0.8), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 1.2), y: r(cy - u * 0.8), auxiliary: false },
      { type: "point", label: C, x: r(cx - u * 0.2), y: r(cy + u * 0.9), auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C], auxiliary: false },
    );
  } else if (presetId === "right_triangle") {
    const [A, B, C] = allocatePointLabels(api, 3);
    reserved.add(A); reserved.add(B); reserved.add(C);
    const lineAB = aux("lineAB");
    const perpA = aux("perpA");
    const angA = aux("angA");
    polyLabel = !api.exists(`${A}${B}${C}`) ? `${A}${B}${C}` : aux("poly");
    actions.push(
      { type: "point", label: A, x: r(cx - u), y: r(cy - u * 0.8), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 1.2), y: r(cy - u * 0.8), auxiliary: false },
      { type: "construct", kind: "line", label: lineAB, refs: [A, B], auxiliary: true },
      { type: "construct", kind: "perpendicular", label: perpA, refs: [A, lineAB], auxiliary: true },
      { type: "construct", kind: "point_on", label: C, refs: [perpA], position: { x: r(cx - u), y: r(cy + u * 0.9) }, auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C], auxiliary: false },
      { type: "construct", kind: "angle", label: angA, refs: [B, A, C], auxiliary: false },
    );
  } else if (presetId === "isosceles_triangle") {
    const [A, B, C] = allocatePointLabels(api, 3);
    reserved.add(A); reserved.add(B); reserved.add(C);
    const bisBC = aux("bisBC");
    polyLabel = !api.exists(`${A}${B}${C}`) ? `${A}${B}${C}` : aux("poly");
    actions.push(
      { type: "point", label: B, x: r(cx - u * 1.1), y: r(cy - u * 0.8), auxiliary: false },
      { type: "point", label: C, x: r(cx + u * 1.1), y: r(cy - u * 0.8), auxiliary: false },
      { type: "construct", kind: "perpendicular_bisector", label: bisBC, refs: [B, C], auxiliary: true },
      { type: "construct", kind: "point_on", label: A, refs: [bisBC], position: { x: cx, y: r(cy + u) }, auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C], auxiliary: false },
    );
  } else if (presetId === "equilateral_triangle") {
    const [A, B] = allocatePointLabels(api, 2);
    reserved.add(A); reserved.add(B);
    polyLabel = aux("tri");
    actions.push(
      { type: "point", label: A, x: r(cx - u), y: r(cy - u * 0.7), auxiliary: false },
      { type: "point", label: B, x: r(cx + u), y: r(cy - u * 0.7), auxiliary: false },
      { type: "construct", kind: "regular_polygon", label: polyLabel, refs: [A, B], value: 3, auxiliary: false },
    );
  } else if (presetId === "square") {
    const [A, B] = allocatePointLabels(api, 2);
    reserved.add(A); reserved.add(B);
    polyLabel = aux("sq");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 0.9), y: r(cy - u * 0.9), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 0.9), y: r(cy - u * 0.9), auxiliary: false },
      { type: "construct", kind: "regular_polygon", label: polyLabel, refs: [A, B], value: 4, auxiliary: false },
    );
  } else if (presetId === "rectangle") {
    const [A, B, C, D] = allocatePointLabels(api, 4);
    reserved.add(A); reserved.add(B); reserved.add(C); reserved.add(D);
    const lineAB = aux("lineAB");
    const perpA = aux("perpA");
    const vecAD = aux("vecAD");
    const angA = aux("angA");
    polyLabel = !api.exists(`${A}${B}${C}${D}`) ? `${A}${B}${C}${D}` : aux("rect");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 1.2), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 1.2), y: r(cy - u * 0.75), auxiliary: false },
      { type: "construct", kind: "line", label: lineAB, refs: [A, B], auxiliary: true },
      { type: "construct", kind: "perpendicular", label: perpA, refs: [A, lineAB], auxiliary: true },
      { type: "construct", kind: "point_on", label: D, refs: [perpA], position: { x: r(cx - u * 1.2), y: r(cy + u * 0.75) }, auxiliary: false },
      { type: "construct", kind: "vector", label: vecAD, refs: [A, D], auxiliary: true },
      { type: "construct", kind: "translate", label: C, refs: [B, vecAD], auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C, D], auxiliary: false },
      { type: "construct", kind: "angle", label: angA, refs: [B, A, D], auxiliary: false },
    );
  } else if (presetId === "parallelogram") {
    const [A, B, C, D] = allocatePointLabels(api, 4);
    reserved.add(A); reserved.add(B); reserved.add(C); reserved.add(D);
    const vecAD = aux("vecAD");
    polyLabel = !api.exists(`${A}${B}${C}${D}`) ? `${A}${B}${C}${D}` : aux("para");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 1.3), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 0.8), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: D, x: r(cx - u * 0.8), y: r(cy + u * 0.75), auxiliary: false },
      { type: "construct", kind: "vector", label: vecAD, refs: [A, D], auxiliary: true },
      { type: "construct", kind: "translate", label: C, refs: [B, vecAD], auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C, D], auxiliary: false },
    );
  } else if (presetId === "rhombus") {
    const [A, B, C, D] = allocatePointLabels(api, 4);
    reserved.add(A); reserved.add(B); reserved.add(C); reserved.add(D);
    const bisAC = aux("bisAC");
    const midAC = aux("midAC");
    polyLabel = !api.exists(`${A}${B}${C}${D}`) ? `${A}${B}${C}${D}` : aux("rhom");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 1.2), y: cy, auxiliary: false },
      { type: "point", label: C, x: r(cx + u * 1.2), y: cy, auxiliary: false },
      { type: "construct", kind: "perpendicular_bisector", label: bisAC, refs: [A, C], auxiliary: true },
      { type: "construct", kind: "midpoint", label: midAC, refs: [A, C], auxiliary: true },
      { type: "construct", kind: "point_on", label: B, refs: [bisAC], position: { x: cx, y: r(cy - u * 0.75) }, auxiliary: false },
      { type: "construct", kind: "reflect", label: D, refs: [B, midAC], auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C, D], auxiliary: false },
    );
  } else if (presetId === "trapezoid") {
    const [A, B, C, D] = allocatePointLabels(api, 4);
    reserved.add(A); reserved.add(B); reserved.add(C); reserved.add(D);
    const lineAB = aux("lineAB");
    const parD = aux("parD");
    polyLabel = !api.exists(`${A}${B}${C}${D}`) ? `${A}${B}${C}${D}` : aux("trap");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 1.3), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 1.3), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: D, x: r(cx - u * 0.8), y: r(cy + u * 0.75), auxiliary: false },
      { type: "construct", kind: "line", label: lineAB, refs: [A, B], auxiliary: true },
      { type: "construct", kind: "parallel", label: parD, refs: [D, lineAB], auxiliary: true },
      { type: "construct", kind: "point_on", label: C, refs: [parD], position: { x: r(cx + u * 0.6), y: r(cy + u * 0.75) }, auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C, D], auxiliary: false },
    );
  } else if (presetId === "isosceles_trapezoid") {
    const [A, B, C, D] = allocatePointLabels(api, 4);
    reserved.add(A); reserved.add(B); reserved.add(C); reserved.add(D);
    const bisAB = aux("bisAB");
    polyLabel = !api.exists(`${A}${B}${C}${D}`) ? `${A}${B}${C}${D}` : aux("isotrap");
    actions.push(
      { type: "point", label: A, x: r(cx - u * 1.3), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: B, x: r(cx + u * 1.3), y: r(cy - u * 0.75), auxiliary: false },
      { type: "point", label: D, x: r(cx - u * 0.75), y: r(cy + u * 0.75), auxiliary: false },
      { type: "construct", kind: "perpendicular_bisector", label: bisAB, refs: [A, B], auxiliary: true },
      { type: "construct", kind: "reflect", label: C, refs: [D, bisAB], auxiliary: false },
      { type: "construct", kind: "polygon", label: polyLabel, refs: [A, B, C, D], auxiliary: false },
    );
  } else {
    const sides = presetId === "pentagon" ? 5 : presetId === "hexagon" ? 6 : 8;
    const [A, B] = allocatePointLabels(api, 2);
    reserved.add(A); reserved.add(B);
    polyLabel = aux("poly");
    const sideLen = u * (sides === 5 ? 1.1 : sides === 6 ? 0.95 : 0.75);
    actions.push(
      { type: "point", label: A, x: r(cx - sideLen / 2), y: r(cy - u * 0.85), auxiliary: false },
      { type: "point", label: B, x: r(cx + sideLen / 2), y: r(cy - u * 0.85), auxiliary: false },
      { type: "construct", kind: "regular_polygon", label: polyLabel, refs: [A, B], value: sides, auxiliary: false },
    );
  }

  controller.apply(actions);
  controller.setMode(0);
  controller.select(polyLabel);
  return polyLabel;
}

