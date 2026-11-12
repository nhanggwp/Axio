import type { GGBApi } from "../types/geogebra";
import { geometryNames } from "../../shared/geometryNames";

// Stored on a hidden native point, so the annotation survives rename/save/load.
const MARKER = "Axio: angle-bisector marks v1";
const completed = new WeakMap<GGBApi, Map<string, string>>();
function angleLabel(api: GGBApi) {
  for (const name of "αβγδεζηθικλμνξοπρστυφχψω")
    if (!api.exists(name)) return name;
  return available(api, "α");
}
function available(api: GGBApi, prefix: string) {
  let suffix = 1;
  while (api.exists(`${prefix}${suffix}`)) suffix++;
  return `${prefix}${suffix}`;
}

function decorationGroup(api: GGBApi, preferredColor: string) {
  const used = new Set(
    api.getAllObjectNames("angle").map((name) => {
      const type =
        new DOMParser()
          .parseFromString(api.getXML(name), "application/xml")
          .querySelector("decoration")
          ?.getAttribute("type") ?? "0";
      return `${api.getColor(name)}:${type}`;
    }),
  );
  for (const color of new Set([
    preferredColor,
    "#23232D",
    "#4F18E9",
    "#E31665",
    "#116A7B",
    "#6B4F1D",
  ])) {
    for (const type of [3, 4, 5, 1, 2])
      if (!used.has(`${color}:${type}`)) return { color, type };
  }
  for (let value = 0x202020; value < 0xa0a0a0; value += 0x01030b) {
    const color = `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
    if (!used.has(`${color}:3`)) return { color, type: 3 };
  }
  throw new Error("Hình có quá nhiều nhóm ký hiệu góc.");
}

/** A hidden construction line may still be represented by a visible bisector segment. */
function hasVisibleSegment(api: GGBApi, line: string) {
  const refs = geometryNames(api.getCommandString(line, false)).slice(1);
  if (
    refs.length !== 3 ||
    !refs.every(
      (n) =>
        api.exists(n) && api.getObjectType(n) === "point" && api.isDefined(n),
    )
  )
    return false;
  const [a, vertex, b] = refs;
  const x = api.getXcoord(vertex),
    y = api.getYcoord(vertex);
  const ux = api.getXcoord(a) - x,
    uy = api.getYcoord(a) - y,
    vx = api.getXcoord(b) - x,
    vy = api.getYcoord(b) - y;
  const u = Math.hypot(ux, uy),
    v = Math.hypot(vx, vy);
  if (u < 1e-10 || v < 1e-10) return false;
  const dx = ux / u + vx / v,
    dy = uy / u + vy / v;
  return api.getAllObjectNames("segment").some((name) => {
    if (!api.getVisible(name) || !api.isDefined(name)) return false;
    const ends = geometryNames(api.getCommandString(name, false)).slice(1, 3);
    if (!ends.includes(vertex)) return false;
    const other = ends.find((n) => n !== vertex);
    if (!other || !api.exists(other)) return false;
    const ex = api.getXcoord(other) - x,
      ey = api.getYcoord(other) - y;
    return (
      ex * dx + ey * dy > 1e-10 &&
      Math.abs(ex * dy - ey * dx) <
        1e-8 * Math.max(1, Math.hypot(ex, ey) * Math.hypot(dx, dy))
    );
  });
}

/** Add two native, dependent equal-angle marks to visible three-point bisectors. */
export function ensureBisectorMarks(api: GGBApi) {
  const cache = completed.get(api) ?? new Map<string, string>();
  completed.set(api, cache);
  const candidates = api.getAllObjectNames("line").filter((name) => {
    if (
      api.getObjectType(name) !== "line" ||
      (!api.getVisible(name) && !hasVisibleSegment(api, name)) ||
      !/^(?:Angle|Angular)Bisector[\[(]/.test(api.getCommandString(name, false))
    )
      return false;
    const helper = cache.get(name);
    return (
      !helper || !api.exists(helper) || api.getCaption(helper, false) !== MARKER
    );
  });
  if (!candidates.length) return;
  const doc = new DOMParser().parseFromString(api.getXML(), "application/xml");
  const commands = Array.from(doc.querySelectorAll("construction > command"));
  for (const command of commands) {
    if (
      !["AngleBisector", "AngularBisector"].includes(
        command.getAttribute("name") ?? "",
      )
    )
      continue;
    const inputs = Array.from(
      command.querySelector("input")?.attributes ?? [],
    ).map((a) => a.value);
    const line = command.querySelector("output")?.getAttribute("a0");
    if (
      inputs.length !== 3 ||
      !line ||
      !candidates.includes(line) ||
      !api.exists(line) ||
      (!api.getVisible(line) && !hasVisibleSegment(api, line)) ||
      !inputs.every(
        (n) =>
          api.exists(n) && api.getObjectType(n) === "point" && api.isDefined(n),
      )
    )
      continue;
    const [a, vertex, b] = inputs;
    const ux = api.getXcoord(a) - api.getXcoord(vertex),
      uy = api.getYcoord(a) - api.getYcoord(vertex);
    const vx = api.getXcoord(b) - api.getXcoord(vertex),
      vy = api.getYcoord(b) - api.getYcoord(vertex);
    const u = Math.hypot(ux, uy),
      v = Math.hypot(vx, vy);
    if (u < 1e-10 || v < 1e-10 || Math.abs(ux * vy - uy * vx) < 1e-10 * u * v)
      continue;
    const existing = commands.find((c) => {
      if (
        c.getAttribute("name") !== "ClosestPoint" ||
        c.querySelector("input")?.getAttribute("a0") !== line
      )
        return false;
      const output = c.querySelector("output")?.getAttribute("a0");
      return (
        !!output &&
        api.exists(output) &&
        api.getCaption(output, false) === MARKER
      );
    });
    // Leave intentional edits/hiding/deletion of the angle objects intact.
    if (existing) {
      cache.set(line, existing.querySelector("output")!.getAttribute("a0")!);
      continue;
    }
    const helper = available(api, "axioBisectorPoint");
    const made: string[] = [];
    const decoration = decorationGroup(api, api.getColor(line));
    try {
      const target = `${vertex}+(${a}-${vertex})/Distance[${a},${vertex}]+(${b}-${vertex})/Distance[${b},${vertex}]`;
      if (!api.evalCommand(`${helper}=ClosestPoint[${line},${target}]`))
        throw new Error("Không thể đánh dấu phân giác.");
      made.push(helper);
      api.setAuxiliary(helper, true);
      api.setVisible(helper, false);
      api.setLabelVisible(helper, false);
      for (const refs of [
        [a, vertex, helper],
        [helper, vertex, b],
      ]) {
        const angle = angleLabel(api);
        if (!api.evalCommand(`${angle}=Angle[${refs.join(",")}]`))
          throw new Error("Không thể đánh dấu góc bằng nhau.");
        made.push(angle);
        // Native non-reflex angles keep the same meaning when orientation flips.
        const element = new DOMParser().parseFromString(
          api.getXML(angle),
          "application/xml",
        ).documentElement;
        for (const [tag, attribute, value] of [
          ["angleStyle", "val", "1"],
          ["arcSize", "val", "36"],
          ["decoration", "type", String(decoration.type)],
        ]) {
          let property = element.querySelector(tag);
          if (!property) {
            property = element.ownerDocument.createElement(tag);
            element.append(property);
          }
          property.setAttribute(attribute, value);
        }
        api.evalXML(new XMLSerializer().serializeToString(element));
        api.setAuxiliary(angle, false);
        api.setVisible(angle, true);
        api.setLabelVisible(angle, false);
        api.setLabelStyle(angle, 0);
        api.setFilling(angle, 0);
        api.setLineThickness(angle, 2);
        const color = decoration.color;
        api.setColor(
          angle,
          ...([1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [
            number,
            number,
            number,
          ]),
        );
      }
      api.setCaption(helper, MARKER);
      cache.set(line, helper);
    } catch (error) {
      for (const name of made.reverse())
        if (api.exists(name)) api.deleteObject(name);
      throw error;
    }
  }
}
