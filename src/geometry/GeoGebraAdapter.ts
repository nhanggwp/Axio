import type { GGBApi } from "../types/geogebra";
import type { GeometryObject } from "../../shared/actions";
import { triangleVertices } from "./triangleVertices";
import { formatSegmentLabels, segmentDisplayName } from "./segmentLabels";
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
      color: this.api.getColor(name),
      labelVisible: /<show[^>]*label="true"/.test(this.api.getXML(name)),
      thickness: this.api.getLineThickness(name),
      lineStyle: this.api.getLineStyle(name),
      ...(["triangle", "polygon"].includes(this.api.getObjectType(name))
        ? { vertices: (() => { try { return triangleVertices(this.api, name); } catch { return undefined; } })() }
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
    this.api.setPointCapture(1, 1);
  }
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
  resetView() {
    const view = JSON.parse(this.api.getViewProperties(1)) as {
      width: number;
      height: number;
    };
    const points = this.api
      .getAllObjectNames("point")
      .filter((name) => this.api.isDefined(name))
      .map((name) => ({
        x: this.api.getXcoord(name),
        y: this.api.getYcoord(name),
      }));
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
    const valid = points.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    const left = valid.length ? Math.min(...valid.map((p) => p.x)) : -4,
      right = valid.length ? Math.max(...valid.map((p) => p.x)) : 4,
      bottom = valid.length ? Math.min(...valid.map((p) => p.y)) : -4,
      top = valid.length ? Math.max(...valid.map((p) => p.y)) : 4;
    const scale = Math.min(
      view.width / (Math.max(right - left, 2) * 1.3),
      view.height / (Math.max(top - bottom, 2) * 1.3),
    );
    const cx = (left + right) / 2,
      cy = (top + bottom) / 2;
    this.api.setCoordSystem(
      cx - view.width / (2 * scale),
      cx + view.width / (2 * scale),
      cy - view.height / (2 * scale),
      cy + view.height / (2 * scale),
    );
  }
}
