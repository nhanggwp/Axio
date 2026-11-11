import { contentBounds, svgCanvas, whiteSVG } from "./exportImage";
import { configureCoordinateAxes, formatPointCoordinates } from "./coordinateDisplay";
import type { GGBApi } from "../types/geogebra";
import type { GeometryObject } from "../../shared/actions";
import { isPolygonType, polygonVertices } from "./triangleVertices";
import { formatSegmentLabels, hideDuplicateBoundaryLabels, segmentDisplayName } from "./segmentLabels";
let script: Promise<void> | undefined;
export function loadGeoGebra() {
  return (script ??= new Promise<void>((resolve, reject) => {
    if (window.GGBApplet) return resolve();
    const el = document.createElement("script");
    const timeout = setTimeout(() => {
      script = undefined;
      el.remove();
      reject(new Error("GeoGebra tải quá lâu. Kiểm tra mạng rồi thử lại."));
    }, 30000);
    el.src = "https://www.geogebra.org/apps/deployggb.js";
    el.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    el.onerror = () => {
      clearTimeout(timeout);
      script = undefined;
      el.remove();
      reject(
        new Error("Không thể tải GeoGebra. Kiểm tra kết nối mạng rồi thử lại."),
      );
    };
    document.head.append(el);
  }));
}
export class GeoGebraAdapter {
  constructor(public readonly api: GGBApi) {}
  command(command: string) {
    if (!this.api.evalCommand(command))
      throw new Error("Không thể dựng hình: " + command);
  }
  objects(): GeometryObject[] {
    return this.api.getAllObjectNames().map((name) => ({
      name,
      displayName: segmentDisplayName(this.api, name),
      type: this.api.getObjectType(name),
      value: this.api.getValueString(name, false),
      definition: this.api.getCommandString(name, false),
      independent: this.api.isIndependent(name),
      moveable: this.api.isMoveable(name),
      visible: this.api.getVisible(name),
      auxiliary: /<auxiliary\b[^>]*val="true"/.test(this.api.getXML(name)),
      color: this.api.getColor(name),
      labelVisible: /<show[^>]*label="true"/.test(this.api.getXML(name)),
      thickness: this.api.getLineThickness(name),
      lineStyle: this.api.getLineStyle(name),
      ...(isPolygonType(this.api.getObjectType(name))
        ? { vertices: (() => { try { return polygonVertices(this.api, name); } catch { return undefined; } })() }
        : {}),
      ...(this.api.getObjectType(name) === "point"
        ? { x: this.api.getXcoord(name), y: this.api.getYcoord(name) }
        : {}),
    }));
  }
  color(name: string, color: string) {
    this.api.setColor(
      name,
      ...([1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ]),
    );
  }
  snapshot() {
    return this.api.getXML();
  }
  restore(xml: string) {
    this.api.setXML(xml);
    this.formatSegmentLabels();
  }
  formatSegmentLabels(names?: string[]) { formatSegmentLabels(this.api, names); }
  hideDuplicateBoundaryLabels(names?: string[]) { hideDuplicateBoundaryLabels(this.api, names); }
  base64() {
    return new Promise<string>((resolve) => this.api.getBase64(resolve));
  }
  configureView() {
    this.api.setPerspective("G");
    this.api.setAxesVisible(false, false);
    this.api.setGridVisible(true);
    this.api.setRounding("2");
    this.api.setGraphicsOptions(1, {
      gridColor: "#E5F0F2",
      gridIsBold: false,
      gridType: 0,
      gridDistance: { x: 0.27, y: 0.27 },
      bgColor: "#FFFFFF",
    });
    this.api.setGraphicsOptions(1, {axesColor:"#23232D",axes:{x:{label:"x",showNumbers:true,tickStyle:1},y:{label:"y",showNumbers:true,tickStyle:1}}});
    this.api.setPointCapture(1, 1);
  }
  setCoordinateAxes(visible: boolean) { configureCoordinateAxes(this.api, visible); }
  formatPointLabels() { formatPointCoordinates(this.api); }
  viewState() {
    const raw = this.api.getGraphicsOptions(1);
    const options = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      grid: boolean;
      axes: { x: { visible: boolean }; y: { visible: boolean } };
      pointCapturing: number;
    };
    const view = JSON.parse(this.api.getViewProperties(1)) as { invXscale: number };
    return {
      grid: options.grid,
      axes: options.axes.x.visible || options.axes.y.visible,
      snap: options.pointCapturing !== 0,
      invXscale: view.invXscale,
    };
  }
  zoom(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const v = JSON.parse(this.api.getViewProperties(1));
    const width = v.width * v.invXscale / factor;
    const height = v.height * v.invYscale / factor;
    if (width < 0.2 || width > 5000 || height < 0.2 || height > 5000) return;
    const cx = v.xMin + v.width * v.invXscale / 2;
    const cy = v.yMin + v.height * v.invYscale / 2;
    this.api.setCoordSystem(cx - width / 2, cx + width / 2, cy - height / 2, cy + height / 2);
  }
  resetView() {
    const view = JSON.parse(this.api.getViewProperties(1)) as {
      width: number;
      height: number;
    };
    const points = this.api
      .getAllObjectNames("point")
      .filter((name) => this.api.isDefined(name) && this.api.getVisible(name))
      .map((name) => ({
        x: this.api.getXcoord(name),
        y: this.api.getYcoord(name),
      }));
    // Unbounded graphs must be sampled on a bounded domain; showAllObjects()
    // can otherwise expand the viewport repeatedly until the plot disappears.
    for (const name of this.api.getAllObjectNames("function")) {
      if (!this.api.getVisible(name) || !/^[A-Za-z][A-Za-z0-9_]*'{0,3}$/.test(name)) continue;
      for (const x of [0, 1, -1, 2, -2, 4, -4, 10, -10]) {
        const y = this.api.getValue(`${name}(${x})`);
        if (Number.isFinite(y)) {
          points.push({ x: x - 4, y: y - 4 }, { x: x + 4, y: y + 4 });
          break;
        }
      }
    }
    const doc = new DOMParser().parseFromString(
      this.api.getXML(),
      "application/xml",
    );
    for (const element of doc.querySelectorAll(
      'construction > element[type="conic"]',
    )) {
      const name = element.getAttribute("label")!;
      if (
        this.api.getObjectType(name) !== "circle" ||
        !this.api.getVisible(name)
      )
        continue;
      const m = element.querySelector("matrix");
      if (!m) continue;
      const a = Number(m.getAttribute("A0")),
        cx = -Number(m.getAttribute("A4")) / a,
        cy = -Number(m.getAttribute("A5")) / a,
        r = Math.sqrt(cx * cx + cy * cy - Number(m.getAttribute("A2")) / a);
      if (Number.isFinite(r))
        points.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
    }
    if (!points.length) {
      for (const name of this.api.getAllObjectNames("line")) {
        if (!this.api.getVisible(name)) continue;
        const element = new DOMParser().parseFromString(this.api.getXML(name), "application/xml");
        const c = element.querySelector("coords");
        if (!c) continue;
        const a = Number(c.getAttribute("x")), b = Number(c.getAttribute("y")), z = Number(c.getAttribute("z")), norm = Math.hypot(a, b);
        if (!norm) continue;
        const x = -a * z / (norm * norm), y = -b * z / (norm * norm);
        points.push({ x: x - 2 * b / norm, y: y + 2 * a / norm }, { x: x + 2 * b / norm, y: y - 2 * a / norm });
      }
    }
    if (this.viewState().axes) points.push({x:0,y:0});
    const valid = points.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    const left = valid.length ? Math.min(...valid.map((p) => p.x)) : -4,
      right = valid.length ? Math.max(...valid.map((p) => p.x)) : 4,
      bottom = valid.length ? Math.min(...valid.map((p) => p.y)) : -4,
      top = valid.length ? Math.max(...valid.map((p) => p.y)) : 4;
    const minimumSpan = this.viewState().axes ? 8 : 2;
    const scale = Math.min(
      view.width / (Math.max(right - left, minimumSpan) * 1.3),
      view.height / (Math.max(top - bottom, minimumSpan) * 1.3),
    );
    const cx = (left + right) / 2,
      cy = (top + bottom) / 2;
    if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(cx) || !Number.isFinite(cy)) return;
    this.api.setCoordSystem(
      cx - view.width / (2 * scale),
      cx + view.width / (2 * scale),
      cy - view.height / (2 * scale),
      cy + view.height / (2 * scale),
    );
  }
  async renderExport<T>(options: { center?: boolean; grid?: boolean; axes?: boolean }, render: () => T | Promise<T>): Promise<T> {
    const view = JSON.parse(this.api.getViewProperties(1));
    const before = this.viewState();
    const rawOptions = this.api.getGraphicsOptions(1);
    const optionsBefore = typeof rawOptions === "string" ? JSON.parse(rawOptions) : rawOptions;
    const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      this.api.setGridVisible(options.grid ?? false);
      this.api.setGraphicsOptions(1, { bgColor: "#FFFFFF" });
      if (options.axes !== undefined) this.api.setAxesVisible(options.axes, options.axes);
      if (options.center !== false) this.resetView();
      await paint();
      return await render();
    } finally {
      this.api.setGridVisible(before.grid);
      this.api.setGraphicsOptions(1, { bgColor: optionsBefore.bgColor ?? "#FFFFFF" });
      this.api.setAxesVisible(optionsBefore.axes.x.visible, optionsBefore.axes.y.visible);
      this.api.setCoordSystem(view.xMin, view.xMin + view.width * view.invXscale, view.yMin, view.yMin + view.height * view.invYscale);
      await paint();
    }
  }
  private nativeSVG() {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Xuất SVG quá lâu. Hãy thử lại.")), 10000);
      this.api.exportSVG(svg => { clearTimeout(timer); if (svg) resolve(svg); else reject(new Error("Không thể xuất SVG cho góc nhìn này.")); });
    });
  }
  private async focusedSVG(options: { center?: boolean; grid?: boolean }) {
    // Measure geometry without the grid, which otherwise fills the entire image.
    this.api.setGridVisible(false);
    const geometry = await this.nativeSVG();
    const bounds = options.center !== false ? await contentBounds(geometry) : undefined;
    if (options.grid) {
      this.api.setGridVisible(true);
      return whiteSVG(await this.nativeSVG(), bounds);
    }
    return whiteSVG(geometry, bounds);
  }
  exportPNG(options: { center?: boolean; grid?: boolean; axes?: boolean } = {}) {
    return this.renderExport(options, async () => {
      const canvas = await svgCanvas(await this.focusedSVG(options), 2);
      return canvas.toDataURL("image/png").split(",")[1];
    });
  }
  exportSVG(options: { center?: boolean; grid?: boolean; axes?: boolean } = {}) {
    return this.renderExport(options, () => this.focusedSVG(options));
  }
}
