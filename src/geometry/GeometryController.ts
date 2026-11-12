import { applyObjectLabel, hasMeasurementIntent, isMeasurementObject, measurementVisible, setMeasurementVisible } from "./segmentLabels";
import { geometryNames } from "../../shared/geometryNames";
import { GeoGebraAdapter } from "./GeoGebraAdapter";
import { ConstructionHistory } from "./ConstructionHistory";
import { executeActions } from "./CommandExecutor";
import { validateGeometry } from "./GeometryChecks";
import { constructionKey, normalizeClientEvent } from "./GeometryState";
import { SelectionManager, affectedByDeletion } from "./SelectionManager";
import { selectionBounds } from "./ScreenProjection";
import { isPolygonType } from "./triangleVertices";
import { compileExpression, canEditExpression } from "./ExpressionInput";
import { bindCircumcircleVertices, circumcircleBoundary, circleGeometry, projectOnCircle, type CircleBoundary } from "./CircleBoundary";
import type { GeometryAction, GeometryObject, GeometryCheck } from "../../shared/actions";

export type TransformHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

type PointSnapshot = { name: string; x0: number; y0: number };
type CircleSnapshot = { name: string; center: string; r0: number };

export class GeometryController {
  readonly history = new ConstructionHistory();
  readonly selections = new SelectionManager();
  objects: GeometryObject[] = [];
  drawingFeedback = "";
  documentGeneration = 0;
  revision = 0;
  viewRevision = 0;
  loading = false;
  saved = "";
  mode = 0;
  private key = "";
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private paused = false;
  private disposed = false;
  private synchronizingSelection = false;
  private selectionQueued = false;
  private dragging = false;
  private loadGeneration = 0;
  private pointer: {
    modified: boolean;
    before: string[];
    hit: string | null;
    x: number;
    y: number;
    wx0: number;
    wy0: number;
    moved: boolean;
    proxy?:
      | { kind: "locked" }
      | { kind: "circle_vertex"; target: string; x0: number; y0: number; boundary: CircleBoundary; prepared: boolean }
      | {
          kind: "direct_point";
          target: string;
          x0: number;
          y0: number;
          hiddenHelpers: { name: string; dx: number; dy: number }[];
        }
      | {
          kind: "rotate_drivers";
          anchor: string;
          ax: number;
          ay: number;
          r0: number;
          angle0: number;
          allowScale: boolean;
          drivers: PointSnapshot[];
          boundary?: CircleBoundary;
        }
      | { kind: "translate_group"; freePoints: PointSnapshot[]; pathPoints: PointSnapshot[] }
      | null;
  } | null = null;
  private transformState: {
    handle: TransformHandle;
    wx0: number;
    wy0: number;
    wxMin: number;
    wxMax: number;
    wyMin: number;
    wyMax: number;
    freePoints: PointSnapshot[];
    pathPoints: PointSnapshot[];
    fixedCircles: CircleSnapshot[];
    hasRigidConstraint: boolean;
  } | null = null;
  constructor(readonly adapter: GeoGebraAdapter) {
    adapter.ensureBisectorMarks();
    adapter.formatSegmentLabels();
    adapter.formatPointLabels();
    adapter.hideDuplicateBoundaryLabels();
    this.history.reset(adapter.snapshot());
    this.saved = constructionKey(adapter.snapshot());
    this.key = this.saved;
    this.sync();
    const a = adapter.api;
    a.registerAddListener(this.added);
    a.registerRemoveListener(this.changed);
    a.registerUpdateListener(this.changed);
    a.registerClearListener(this.changed);
    a.registerRenameListener(this.renamed);
    a.registerClickListener(this.clicked);
    a.registerClientListener(this.client);
  }
  get interacting() {
    return this.dragging;
  }
  get hasProxyDrag() {
    return !!this.pointer?.proxy || !!this.transformState;
  }
  get selectedNames() {
    return this.selections.names;
  }
  get selection() {
    return this.selectedNames.at(-1) ?? null;
  }
  set selection(name: string | null) {
    this.selections.set(name ? [name] : [], (n) => this.adapter.api.exists(n));
  }
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  private emit() {
    if (!this.disposed) this.listeners.forEach((cb) => cb());
  }
  sync = () => {
    if (this.disposed) return;
    this.adapter.ensureBisectorMarks();
    this.adapter.formatSegmentLabels();
    this.adapter.formatPointLabels();
    this.objects = this.adapter.objects();
    this.selections.set(this.selectedNames, (n) => this.adapter.api.exists(n));
    const key = constructionKey(this.adapter.snapshot());
    if (key !== this.key) {
      this.key = key;
      this.revision++;
    }
    this.emit();
  };
  private changed = () => {
    if (this.paused || this.disposed) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.sync);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.dragging) this.history.push(this.adapter.snapshot());
      this.emit();
    }, 350);
  };
  private added = (name: string) => {
    if (this.paused || this.disposed || this.adapter.isMarkingBisectors) return;
    const a = this.adapter.api,
      type = a.getObjectType(name),
      polygon = isPolygonType(type);
    this.adapter.color(name, polygon ? "#C9E1E6" : "#23232D");
    a.setLineThickness(name, 2);
    if (polygon) a.setFilling(name, 0.18);
    if (type === "point") { a.setPointSize(name, 4); a.setLabelStyle(name, this.adapter.viewState().axes ? 1 : 0); }
    a.setLabelVisible(name, type === "point" || (type === "angle" && this.mode === 36));
    if (type === "angle" && this.mode === 36) a.setLabelStyle(name, 2);
    if (type === "segment") {
      applyObjectLabel(a, name, "name");
      a.setLabelVisible(name, false);
      this.adapter.formatSegmentLabels([name]);
      this.adapter.hideDuplicateBoundaryLabels([name]);
    }
    if (
      this.mode !== 0 &&
      (type !== "point" || this.mode === 1 || this.mode === 501)
    )
      this.drawingFeedback = `Đã tạo ${name}. Tiếp tục dựng hình hoặc chuyển sang Chọn.`;
    this.changed();
  };
  private renamed = (oldName: string, newName: string) => {
    this.selections.set(
      this.selectedNames.map((n) => (n === oldName ? newName : n)),
      (n) => this.adapter.api.exists(n),
    );
    this.changed();
  };
  private isDirectPoint(name: string) {
    const api = this.adapter.api;
    return api.exists(name) && api.getObjectType(name) === "point" && api.isMoveable(name) && (api.isIndependent(name) || /^(Point|Điểm)[\[(]/i.test(api.getCommandString(name, false)));
  }
  private screenToWorld(clientX: number, clientY: number, host?: HTMLElement | null) {
    const api = this.adapter.api;
    const v = JSON.parse(api.getViewProperties(1)) as {
      xMin: number;
      yMin: number;
      width: number;
      height: number;
      invXscale: number;
      invYscale: number;
    };
    const rect = (host?.querySelector(".EuclidianPanel") ?? host)?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      wx: v.xMin + (clientX - rect.left) * v.invXscale,
      wy: v.yMin + (v.height - (clientY - rect.top)) * v.invYscale,
    };
  }
  private connectedComponent(seeds: string[]): Set<string> {
    const api = this.adapter.api;
    const allNames = api.getAllObjectNames();
    const adj = new Map<string, Set<string>>();
    for (const name of allNames) adj.set(name, new Set());
    for (const name of allNames) {
      const cmd = api.getCommandString(name, false);
      for (const ref of geometryNames(cmd)) {
        if (ref !== name && adj.has(ref)) {
          adj.get(name)!.add(ref);
          adj.get(ref)!.add(name);
        }
      }
    }
    const visited = new Set<string>();
    const queue = seeds.filter((s) => adj.has(s));
    for (const s of queue) visited.add(s);
    while (queue.length) {
      const curr = queue.shift()!;
      for (const nb of adj.get(curr) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    return visited;
  }
  private collectGroupSnapshots(names: Iterable<string>) {
    const api = this.adapter.api;
    const freePoints: PointSnapshot[] = [];
    const pathPoints: PointSnapshot[] = [];
    const fixedCircles: CircleSnapshot[] = [];
    let hasRigidConstraint = false;
    for (const name of names) {
      if (!api.exists(name)) continue;
      const type = api.getObjectType(name);
      const cmd = api.getCommandString(name, false);
      if (type === "point" && api.isMoveable(name)) {
        if (api.isIndependent(name)) {
          freePoints.push({ name, x0: api.getXcoord(name), y0: api.getYcoord(name) });
        } else if (/^(Point|Điểm)[\[(]/i.test(cmd)) {
          pathPoints.push({ name, x0: api.getXcoord(name), y0: api.getYcoord(name) });
        }
      }
      const circleMatch = cmd.match(/^(?:Circle|ĐườngTròn)[\[(]\s*([A-Za-z][A-Za-z0-9_]*'*)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*[\])]$/i);
      if (circleMatch && api.exists(circleMatch[1]) && api.getObjectType(circleMatch[1]) === "point") {
        fixedCircles.push({ name, center: circleMatch[1], r0: Number(circleMatch[2]) });
        hasRigidConstraint = true;
      }
      if (
        ["circle", "conic", "angle"].includes(type) ||
        /^(PerpendicularLine|PerpendicularBisector|AngleBisector|Incircle|TriangleCenter|Rotate|Reflect|Circle|ĐườngVuôngGóc|ĐườngTrungTrực|ĐườngPhânGiác|ĐườngTrònNộiTiếp|Quay|ĐốiXứng)/i.test(cmd) ||
        /^(?:Polygon|ĐaGiác)[\[(][^,]+,[^,]+,\s*\d+\s*[\])]$/i.test(cmd)
      ) {
        hasRigidConstraint = true;
      }
    }
    return { freePoints, pathPoints, fixedCircles, hasRigidConstraint };
  }
  private resolveProxy(hit: string) {
    const api = this.adapter.api;
    if (!api.exists(hit)) return null;
    // Explicit user locks must never fall through to dragging connected roots.
    if (/<fixed\b[^>]*val="true"/.test(api.getXML(hit)))
      return { kind: "locked" as const };
    const boundary = api.getObjectType(hit) === "point" ? circumcircleBoundary(api, hit) : null;
    if (boundary && boundary.vertices.every(name => api.isIndependent(name))) {
      return { kind: "circle_vertex" as const, target: hit, x0: api.getXcoord(hit), y0: api.getYcoord(hit), boundary, prepared: false };
    }
    if (boundary) {
      // Constrained polygons retain their shape: rotate their actual upstream
      // controls around the circumcenter, never scale about another vertex.
      const upstream = new Set<string>();
      const visit = (name: string) => {
        if (upstream.has(name) || !api.exists(name)) return;
        upstream.add(name);
        for (const ref of geometryNames(api.getCommandString(name, false)).slice(1)) visit(ref);
      };
      visit(boundary.name);
      const { freePoints, pathPoints } = this.collectGroupSnapshots(upstream);
      const drivers = [...freePoints, ...pathPoints];
      if (drivers.length && drivers.every(p => !/<fixed\b[^>]*val="true"/.test(api.getXML(p.name)))) {
        return { kind: "rotate_drivers" as const, anchor: boundary.name, ax: boundary.x, ay: boundary.y, r0: boundary.r, angle0: Math.atan2(api.getYcoord(hit) - boundary.y, api.getXcoord(hit) - boundary.x), allowScale: false, drivers, boundary };
      }
      return { kind: "locked" as const };
    }
    if (this.isDirectPoint(hit)) {
      const comp = this.connectedComponent([hit]);
      const hiddenHelpers = api.isIndependent(hit)
        ? api
            .getAllObjectNames("point")
            .filter(
              (n) =>
                n !== hit &&
                comp.has(n) &&
                api.isIndependent(n) &&
                api.isMoveable(n) &&
                !api.getVisible(n),
            )
            .map((name) => ({
              name,
              dx: api.getXcoord(name) - api.getXcoord(hit),
              dy: api.getYcoord(name) - api.getYcoord(hit),
            }))
        : [];
      return {
        kind: "direct_point" as const,
        target: hit,
        x0: api.getXcoord(hit),
        y0: api.getYcoord(hit),
        hiddenHelpers,
      };
    }
    const type = api.getObjectType(hit);
    if (type === "point") {
      const comp = this.connectedComponent([hit]);
      const { freePoints, pathPoints, fixedCircles } = this.collectGroupSnapshots(comp);
      const visibleRoots = freePoints.filter((p) => api.getVisible(p.name));
      const hiddenRoots = freePoints.filter((p) => !api.getVisible(p.name));
      const isPolygonVertex = this.objects.some((o) => o.vertices?.includes(hit));
      const segDegree = this.objects.filter(
        (o) =>
          o.type === "segment" &&
          o.visible &&
          new RegExp(
            `^(?:Segment|ĐoạnThẳng)[\\[(]\\s*(?:${hit}\\s*,|[^,\\s]+\\s*,\\s*${hit}\\b)`,
            "i",
          ).test(o.definition),
      ).length;
      const isMainVertex = isPolygonVertex || segDegree >= 2;

      if (visibleRoots.length === 1 && (pathPoints.length > 0 || hiddenRoots.length > 0)) {
        const anchor = visibleRoots[0];
        const hx = api.getXcoord(hit),
          hy = api.getYcoord(hit);
        const rHit = Math.hypot(hx - anchor.x0, hy - anchor.y0);
        const drivers = [...pathPoints, ...hiddenRoots].filter(
          (d) => Math.hypot(d.x0 - anchor.x0, d.y0 - anchor.y0) > 1e-6,
        );
        if (rHit > 1e-6 && drivers.length > 0) {
          return {
            kind: "rotate_drivers" as const,
            anchor: anchor.name,
            ax: anchor.x0,
            ay: anchor.y0,
            r0: rHit,
            angle0: Math.atan2(hy - anchor.y0, hx - anchor.x0),
            allowScale: false,
            drivers,
          };
        }
      }

      if (visibleRoots.length >= 2 && isMainVertex) {
        const anchor = visibleRoots[0];
        const hx = api.getXcoord(hit),
          hy = api.getYcoord(hit);
        const rHit = Math.hypot(hx - anchor.x0, hy - anchor.y0);
        const drivers = [...visibleRoots.slice(1), ...pathPoints, ...hiddenRoots].filter(
          (d) => Math.hypot(d.x0 - anchor.x0, d.y0 - anchor.y0) > 1e-6,
        );
        if (rHit > 1e-6 && drivers.length > 0) {
          return {
            kind: "rotate_drivers" as const,
            anchor: anchor.name,
            ax: anchor.x0,
            ay: anchor.y0,
            r0: rHit,
            angle0: Math.atan2(hy - anchor.y0, hx - anchor.x0),
            allowScale: fixedCircles.length === 0,
            drivers,
          };
        }
      }

      if (freePoints.length > 0 || pathPoints.length > 0) {
        return { kind: "translate_group" as const, freePoints, pathPoints };
      }
      return null;
    }
    if (isPolygonType(type) || ["segment", "circle", "line", "ray", "vector"].includes(type)) {
      const comp = this.connectedComponent([hit]);
      const { freePoints, pathPoints } = this.collectGroupSnapshots(comp);
      if (freePoints.length > 0 || pathPoints.length > 0) {
        return { kind: "translate_group" as const, freePoints, pathPoints };
      }
    }
    return null;
  }
  beginPointer(modified: boolean, hit: string | null, x: number, y: number, host?: HTMLElement | null) {
    const api = this.adapter.api;
    const proxy = this.mode === 0 && !modified && hit ? this.resolveProxy(hit) : null;
    const { wx, wy } = this.screenToWorld(x, y, host);
    this.pointer = {
      modified,
      before: [...this.selectedNames],
      hit,
      x,
      y,
      wx0: wx,
      wy0: wy,
      moved: false,
      proxy,
    };
    this.dragging = true;
    if (this.mode === 0 && hit && api.exists(hit) && api.getObjectType(hit) === "point") {
      if (!this.isDirectPoint(hit) && !proxy) {
        const controls = this.controlPoints(hit);
        this.drawingFeedback = controls.length ? `${hit} phụ thuộc phép dựng · kéo ${controls.join(" hoặc ")} để chỉnh hình.` : `${hit} không di chuyển trực tiếp được. Xem quan hệ trong Thuộc tính.`;
      } else if (this.drawingFeedback) this.drawingFeedback = "";
      this.emit();
    }
  }
  movePointer(x: number, y: number, host?: HTMLElement | null) {
    if (this.transformState && host) {
      this.moveTransform(x, y, host);
      return;
    }
    if (!this.pointer || Math.hypot(x - this.pointer.x, y - this.pointer.y) <= 4) return;
    this.pointer.moved = true;
    const proxy = this.pointer.proxy;
    if (proxy && host) {
      const api = this.adapter.api;
      const { wx, wy } = this.screenToWorld(x, y, host);
      if (proxy.kind === "circle_vertex") {
        const before = this.adapter.snapshot();
        this.paused = true;
        try {
          if (!proxy.prepared) {
            this.history.push(before);
            bindCircumcircleVertices(api, proxy.boundary);
            proxy.prepared = true;
          }
          const target = projectOnCircle(proxy.boundary, proxy.x0 + wx - this.pointer.wx0, proxy.y0 + wy - this.pointer.wy0);
          if (target) api.setCoords(proxy.target, target.x, target.y);
        } catch {
          this.adapter.restore(before);
          this.pointer.proxy = { kind: "locked" };
          this.drawingFeedback = "Không thể trượt đỉnh này mà vẫn giữ các ràng buộc. Hình được giữ nguyên.";
        } finally {
          this.paused = false;
        }
        this.sync();
      } else if (proxy.kind === "direct_point") {
        const dx = wx - this.pointer.wx0;
        const dy = wy - this.pointer.wy0;
        this.paused = true;
        try {
          if (api.exists(proxy.target)) {
            api.setCoords(proxy.target, proxy.x0 + dx, proxy.y0 + dy);
            const ax = api.getXcoord(proxy.target);
            const ay = api.getYcoord(proxy.target);
            for (const h of proxy.hiddenHelpers) {
              if (api.exists(h.name)) api.setCoords(h.name, ax + h.dx, ay + h.dy);
            }
          }
        } finally {
          this.paused = false;
        }
        this.sync();
      } else if (proxy.kind === "rotate_drivers") {
        const da = Math.atan2(wy - proxy.ay, wx - proxy.ax) - proxy.angle0;
        const r1 = Math.hypot(wx - proxy.ax, wy - proxy.ay);
        const scale =
          proxy.allowScale && proxy.r0 > 1e-6
            ? Math.max(0.15, Math.min(15, r1 / proxy.r0))
            : 1;
        const cos = Math.cos(da) * scale;
        const sin = Math.sin(da) * scale;
        const before = proxy.boundary ? this.adapter.snapshot() : null;
        this.paused = true;
        try {
          for (const d of proxy.drivers) {
            if (!api.exists(d.name)) continue;
            const dx = d.x0 - proxy.ax;
            const dy = d.y0 - proxy.ay;
            api.setCoords(
              d.name,
              proxy.ax + dx * cos - dy * sin,
              proxy.ay + dx * sin + dy * cos,
            );
          }
          if (proxy.boundary) {
            const actual = circleGeometry(api, proxy.boundary.name);
            const tolerance = 1e-7 * Math.max(1, proxy.boundary.r);
            if (!actual || Math.hypot(actual.x - proxy.ax, actual.y - proxy.ay) > tolerance || Math.abs(actual.r - proxy.r0) > tolerance) {
              if (before) this.adapter.restore(before);
              this.pointer.proxy = { kind: "locked" };
              this.drawingFeedback = "Điểm có thêm ràng buộc; giữ nguyên đường tròn và hình hiện tại.";
            }
          }
        } finally {
          this.paused = false;
        }
        this.sync();
      } else if (proxy.kind === "translate_group") {
        const dx = wx - this.pointer.wx0;
        const dy = wy - this.pointer.wy0;
        this.paused = true;
        try {
          for (const p of proxy.freePoints) if (api.exists(p.name)) api.setCoords(p.name, p.x0 + dx, p.y0 + dy);
          for (const p of proxy.pathPoints) if (api.exists(p.name)) api.setCoords(p.name, p.x0 + dx, p.y0 + dy);
        } finally {
          this.paused = false;
        }
        this.sync();
      }
    }
  }
  endPointer() {
    if (this.transformState) {
      this.endTransform();
      return;
    }
    const p = this.pointer;
    if (!p) return;
    this.dragging = false;
    this.pointer = null;
    if (this.mode === 0 && p.modified && p.hit && !p.moved) {
      this.selectMany(
        p.before.includes(p.hit)
          ? p.before.filter((n) => n !== p.hit)
          : [...p.before, p.hit],
      );
    } else if (this.mode === 0 && p.hit && !p.modified) {
      if (!p.moved || p.before.length <= 1 || !p.before.includes(p.hit)) {
        this.select(p.hit);
      }
    }
    this.sync();
    this.flush();
  }
  beginTransform(handle: TransformHandle, clientX: number, clientY: number, host: HTMLElement) {
    const sb = selectionBounds(this, host);
    if (!sb) return false;
    const comp = this.connectedComponent(this.selectedNames);
    const { freePoints, pathPoints, fixedCircles, hasRigidConstraint } = this.collectGroupSnapshots(comp);
    if (!freePoints.length && !pathPoints.length && !fixedCircles.length) return false;
    const pMin = this.screenToWorld(sb.left, sb.bottom, host);
    const pMax = this.screenToWorld(sb.right, sb.top, host);
    const start = this.screenToWorld(clientX, clientY, host);
    this.flush();
    this.transformState = {
      handle,
      wx0: start.wx,
      wy0: start.wy,
      wxMin: Math.min(pMin.wx, pMax.wx),
      wxMax: Math.max(pMin.wx, pMax.wx),
      wyMin: Math.min(pMin.wy, pMax.wy),
      wyMax: Math.max(pMin.wy, pMax.wy),
      freePoints,
      pathPoints,
      fixedCircles,
      hasRigidConstraint,
    };
    this.dragging = true;
    this.emit();
    return true;
  }
  moveTransform(clientX: number, clientY: number, host: HTMLElement, shiftKey = false) {
    const st = this.transformState;
    if (!st) return;
    const api = this.adapter.api;
    const { wx, wy } = this.screenToWorld(clientX, clientY, host);
    const cx = (st.wxMin + st.wxMax) / 2;
    const cy = (st.wyMin + st.wyMax) / 2;
    this.paused = true;
    try {
      if (st.handle === "rotate") {
        const a0 = Math.atan2(st.wy0 - cy, st.wx0 - cx);
        const a1 = Math.atan2(wy - cy, wx - cx);
        const da = a1 - a0;
        const cos = Math.cos(da), sin = Math.sin(da);
        for (const p of st.freePoints) {
          if (!api.exists(p.name)) continue;
          const dx = p.x0 - cx, dy = p.y0 - cy;
          api.setCoords(p.name, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
        }
        for (const p of st.pathPoints) {
          if (!api.exists(p.name)) continue;
          const dx = p.x0 - cx, dy = p.y0 - cy;
          api.setCoords(p.name, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
        }
      } else {
        const ax = st.handle.includes("w") ? st.wxMax : st.handle.includes("e") ? st.wxMin : cx;
        const ay = st.handle.includes("s") ? st.wyMax : st.handle.includes("n") ? st.wyMin : cy;
        const spanX0 = (st.handle.includes("w") ? st.wxMin : st.wxMax) - ax;
        const spanY0 = (st.handle.includes("s") ? st.wyMin : st.wyMax) - ay;
        let sx = st.handle.includes("e") || st.handle.includes("w")
          ? Math.abs(spanX0) > 1e-6 ? (wx - ax) / spanX0 : 1
          : 1;
        let sy = st.handle.includes("n") || st.handle.includes("s")
          ? Math.abs(spanY0) > 1e-6 ? (wy - ay) / spanY0 : 1
          : 1;
        sx = Math.max(0.15, Math.min(15, sx));
        sy = Math.max(0.15, Math.min(15, sy));
        if (st.hasRigidConstraint || shiftKey) {
          const uniform =
            st.handle === "e" || st.handle === "w"
              ? sx
              : st.handle === "n" || st.handle === "s"
                ? sy
                : Math.max(0.15, Math.min(15, (sx + sy) / 2));
          sx = uniform;
          sy = uniform;
        }
        for (const p of st.freePoints) {
          if (api.exists(p.name)) {
            api.setCoords(p.name, ax + sx * (p.x0 - ax), ay + sy * (p.y0 - ay));
          }
        }
        const uniformScale = (sx + sy) / 2;
        for (const c of st.fixedCircles) {
          if (api.exists(c.name) && api.exists(c.center)) {
            const nextR = Math.max(0.1, Number((c.r0 * uniformScale).toFixed(4)));
            api.evalCommand(`${c.name}=Circle(${c.center},${nextR})`);
          }
        }
        for (const p of st.pathPoints) {
          if (api.exists(p.name)) {
            api.setCoords(p.name, ax + sx * (p.x0 - ax), ay + sy * (p.y0 - ay));
          }
        }
      }
    } finally {
      this.paused = false;
    }
    this.sync();
  }
  endTransform() {
    if (!this.transformState) return;
    this.transformState = null;
    this.dragging = false;
    this.sync();
    this.flush();
  }
  private clicked = (name: string) => {
    if (this.pointer) this.pointer.hit ??= name;
    if (this.mode === 0 && this.adapter.api.getObjectType(name) === "point" && !this.isDirectPoint(name) && !this.resolveProxy(name)) {
      const controls = this.controlPoints(name);
      this.drawingFeedback = controls.length ? `${name} phụ thuộc phép dựng · kéo ${controls.join(" hoặc ")} để chỉnh hình.` : `${name} không di chuyển trực tiếp được. Xem quan hệ trong Thuộc tính.`;
      this.emit();
    }
    if (this.mode !== 0 && ![1, 6, 27, 40].includes(this.mode)) {
      this.drawingFeedback = `Đã chọn ${name} · tiếp tục theo hướng dẫn của công cụ.`;
      this.emit();
    }
  };
  private queueSelection() {
    if (this.selectionQueued) return;
    this.selectionQueued = true;
    queueMicrotask(() => {
      this.selectionQueued = false;
      this.emit();
    });
  }
  private client = (raw: unknown) => {
    const e = normalizeClientEvent(raw);
    if (this.disposed) return;
    if (e.type === "setMode") {
      this.mode = this.adapter.api.getMode();
      this.emit();
    }
    if (["viewChanged2D", "updateStyle"].includes(e.type)) {
      this.viewRevision++;
      if (e.type === "updateStyle") this.changed();
      else this.emit();
    }
    if ((e.type === "dragEnd" || e.type === "movedGeos") && !this.pointer && !this.transformState) {
      this.dragging = false;
      this.sync();
      this.flush();
    }
    if (this.synchronizingSelection) return;
    if (e.type === "select" && e.target) {
      this.selections.set([...this.selectedNames, e.target], (n) =>
        this.adapter.api.exists(n),
      );
      this.queueSelection();
    }
    if (e.type === "deselect") {
      this.selections.set(
        e.target ? this.selectedNames.filter((n) => n !== e.target) : [],
        (n) => this.adapter.api.exists(n),
      );
      this.queueSelection();
    }
  };
  select(name: string | null, highlight = true) {
    this.selectMany(name ? [name] : [], highlight);
  }
  selectMany(names: string[], highlight = true) {
    this.selections.set(names, (n) => this.adapter.api.exists(n));
    if (highlight) {
      this.synchronizingSelection = true;
      try {
        const safe = this.selectedNames.filter((n) =>
          /^[\p{L}][\p{L}\p{N}_]*'*$/u.test(n),
        );
        this.adapter.api.evalCommand(`SelectObjects(${safe.join(",")})`);
      } finally {
        this.synchronizingSelection = false;
      }
    }
    this.emit();
  }
  toggleSelection(name: string) {
    this.selectMany(
      this.selectedNames.includes(name)
        ? this.selectedNames.filter((n) => n !== name)
        : [...this.selectedNames, name],
    );
  }
  controlPoints(name: string) {
    const found = new Set<string>(), visited = new Set<string>(), api = this.adapter.api;
    const visit = (target: string) => {
      if (visited.has(target) || !api.exists(target)) return;
      visited.add(target);
      if (this.isDirectPoint(target) && api.getVisible(target)) { found.add(target); if (api.isIndependent(target)) return; }
      for (const input of geometryNames(api.getCommandString(target, false))) if (input !== target) visit(input);
    };
    visit(name);
    return [...found].slice(0, 6);
  }
  unlinkTargets(names = this.selectedNames): {
    points: string[];
    circles: string[];
  } {
    const api = this.adapter.api;
    const seeds = names.filter((n) => api.exists(n));
    if (!seeds.length) return { points: [], circles: [] };
    const isLinkedPoint = (name: string) =>
      api.exists(name) &&
      api.getObjectType(name) === "point" &&
      !api.isIndependent(name);
    const isLinkedCircle = (name: string) => {
      if (
        !api.exists(name) ||
        api.getObjectType(name) !== "circle" ||
        !api.getVisible(name)
      ) {
        return false;
      }
      const cmd = api.getCommandString(name, false);
      if (!cmd) return false;
      return geometryNames(cmd).some(
        (ref) => ref !== name && api.exists(ref) && api.getVisible(ref),
      );
    };

    if (seeds.every((n) => api.getObjectType(n) === "circle")) {
      return { points: [], circles: seeds.filter(isLinkedCircle) };
    }

    const comp = this.connectedComponent(seeds);
    const circles = [...comp].filter(isLinkedCircle);
    const primaryVertices = new Set<string>();
    for (const o of this.objects) {
      if (!comp.has(o.name)) continue;
      if (o.vertices?.length) {
        for (const v of o.vertices) {
          if (isLinkedPoint(v)) primaryVertices.add(v);
        }
      }
    }
    if (primaryVertices.size === 0) {
      const segDegree = new Map<string, number>();
      for (const o of this.objects) {
        if (!comp.has(o.name) || o.type !== "segment" || !o.visible) continue;
        const m = o.definition.match(
          /^(?:Segment|ĐoạnThẳng)[\[(]\s*([^,\s]+)\s*,\s*([^,\]\)\s]+)/i,
        );
        if (!m) continue;
        for (const ep of [m[1], m[2]]) {
          segDegree.set(ep, (segDegree.get(ep) ?? 0) + 1);
        }
      }
      for (const [pt, deg] of segDegree) {
        if (deg >= 2 && isLinkedPoint(pt)) {
          primaryVertices.add(pt);
        }
      }
    }

    if (
      seeds.every((n) => api.getObjectType(n) === "point") &&
      !seeds.some((n) => primaryVertices.has(n))
    ) {
      const direct = seeds.filter(isLinkedPoint);
      if (direct.length) return { points: [...new Set(direct)], circles };
    }

    if (primaryVertices.size > 0) {
      return { points: [...primaryVertices], circles };
    }

    const seedPoints = seeds.filter(isLinkedPoint);
    if (seedPoints.length > 0) {
      return { points: [...new Set(seedPoints)], circles };
    }

    return {
      points: [...comp].filter((n) => api.getVisible(n) && isLinkedPoint(n)),
      circles,
    };
  }
  canUnlink(names = this.selectedNames): boolean {
    const { points, circles } = this.unlinkTargets(names);
    return points.length > 0 || circles.length > 0;
  }
  unlinkObjects(names = this.selectedNames): string[] {
    const { points: targetPoints, circles: targetCircles } =
      this.unlinkTargets(names);
    if (!targetPoints.length && !targetCircles.length) return [];
    const api = this.adapter.api;
    const targetSet = new Set(targetPoints);
    const circleSet = new Set(targetCircles);
    const coords = new Map<string, { x: number; y: number }>();
    for (const name of targetSet) {
      if (api.exists(name) && api.getObjectType(name) === "point") {
        coords.set(name, { x: api.getXcoord(name), y: api.getYcoord(name) });
      }
    }
    const visibleBefore = new Set(
      this.objects.filter((o) => o.visible).map((o) => o.name),
    );
    const usedLabels = new Set(api.getAllObjectNames());
    const newCenters: string[] = [];
    this.mutate(() => {
      const doc = new DOMParser().parseFromString(
        this.adapter.snapshot(),
        "application/xml",
      );
      const construction = doc.querySelector("construction");
      if (!construction) return;

      for (const cmd of [...construction.querySelectorAll(":scope > command")]) {
        const out = cmd.querySelector("output");
        if (!out) continue;
        const outputs = [...out.attributes].map((a) => a.value);
        if (outputs.some((o) => targetSet.has(o) || circleSet.has(o))) {
          cmd.remove();
        }
      }

      for (const expr of [
        ...construction.querySelectorAll(":scope > expression"),
      ]) {
        const label = expr.getAttribute("label");
        if (label && (targetSet.has(label) || circleSet.has(label))) {
          expr.remove();
        }
      }

      for (const name of targetSet) {
        const el = [
          ...construction.querySelectorAll(':scope > element[type="point"]'),
        ].find((e) => e.getAttribute("label") === name);
        if (!el) continue;
        const pt = coords.get(name);
        if (pt) {
          const exprEl = doc.createElement("expression");
          exprEl.setAttribute("label", name);
          exprEl.setAttribute("exp", `(${pt.x}, ${pt.y})`);
          exprEl.setAttribute("type", "point");
          construction.insertBefore(exprEl, el);
          let coordsEl = el.querySelector("coords");
          if (!coordsEl) {
            coordsEl = doc.createElement("coords");
            el.appendChild(coordsEl);
          }
          coordsEl.setAttribute("x", String(pt.x));
          coordsEl.setAttribute("y", String(pt.y));
          coordsEl.setAttribute("z", "1.0");
        }
        el.querySelector("fixed")?.setAttribute("val", "false");
        el.querySelector("auxiliary")?.setAttribute("val", "false");
      }

      for (const cName of circleSet) {
        const el = [
          ...construction.querySelectorAll(':scope > element[type="conic"]'),
        ].find((e) => e.getAttribute("label") === cName);
        const m = el?.querySelector("matrix");
        if (!el || !m) continue;
        const a0 = Number(m.getAttribute("A0"));
        const cx = -Number(m.getAttribute("A4")) / a0;
        const cy = -Number(m.getAttribute("A5")) / a0;
        const r = Math.sqrt(
          cx * cx + cy * cy - Number(m.getAttribute("A2")) / a0,
        );
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) {
          continue;
        }
        let idx = 1;
        while (usedLabels.has(`O_${idx}`)) idx++;
        const centerLabel = `O_${idx}`;
        usedLabels.add(centerLabel);
        newCenters.push(centerLabel);

        const exprEl = doc.createElement("expression");
        exprEl.setAttribute("label", centerLabel);
        exprEl.setAttribute("exp", `(${cx}, ${cy})`);
        exprEl.setAttribute("type", "point");
        construction.insertBefore(exprEl, el);

        const ptEl = doc.createElement("element");
        ptEl.setAttribute("type", "point");
        ptEl.setAttribute("label", centerLabel);
        const showEl = doc.createElement("show");
        showEl.setAttribute("object", "false");
        showEl.setAttribute("label", "false");
        ptEl.appendChild(showEl);
        const auxEl = doc.createElement("auxiliary");
        auxEl.setAttribute("val", "true");
        ptEl.appendChild(auxEl);
        const coordsEl = doc.createElement("coords");
        coordsEl.setAttribute("x", String(cx));
        coordsEl.setAttribute("y", String(cy));
        coordsEl.setAttribute("z", "1.0");
        ptEl.appendChild(coordsEl);
        construction.insertBefore(ptEl, el);

        const cmdEl = doc.createElement("command");
        cmdEl.setAttribute("name", "Circle");
        const inpEl = doc.createElement("input");
        inpEl.setAttribute("a0", centerLabel);
        inpEl.setAttribute("a1", String(Number(r.toFixed(6))));
        cmdEl.appendChild(inpEl);
        const outEl = doc.createElement("output");
        outEl.setAttribute("a0", cName);
        cmdEl.appendChild(outEl);
        construction.insertBefore(cmdEl, el);
      }

      const remainingCommands = [
        ...construction.querySelectorAll(":scope > command"),
      ];
      const needed = new Set<string>(visibleBefore);
      for (const name of targetSet) needed.add(name);
      for (const name of circleSet) needed.add(name);
      for (const name of newCenters) needed.add(name);

      let changed = true;
      while (changed) {
        changed = false;
        for (const cmd of remainingCommands) {
          const out = cmd.querySelector("output");
          const inp = cmd.querySelector("input");
          if (!out || !inp) continue;
          const outputs = [...out.attributes]
            .map((a) => a.value)
            .filter(Boolean);
          if (outputs.some((o) => needed.has(o))) {
            for (const o of outputs) {
              if (!needed.has(o)) {
                needed.add(o);
                changed = true;
              }
            }
            for (const attr of [...inp.attributes]) {
              for (const ref of geometryNames(attr.value)) {
                if (!needed.has(ref)) {
                  needed.add(ref);
                  changed = true;
                }
              }
            }
          }
        }
      }

      for (const cmd of remainingCommands) {
        const out = cmd.querySelector("output");
        const outputs = out
          ? [...out.attributes].map((a) => a.value).filter(Boolean)
          : [];
        if (outputs.length > 0 && outputs.every((o) => !needed.has(o))) {
          cmd.remove();
        }
      }

      for (const node of [
        ...construction.querySelectorAll(
          ":scope > element, :scope > expression",
        ),
      ]) {
        const label = node.getAttribute("label");
        if (label && !needed.has(label)) {
          node.remove();
        }
      }

      const nextXml = new XMLSerializer().serializeToString(doc);
      this.adapter.restore(nextXml);
      for (const name of [...targetSet, ...newCenters]) {
        if (api.exists(name)) {
          api.setFixed(name, false, true);
        }
      }
      for (const name of newCenters) {
        if (api.exists(name)) {
          api.setAuxiliary(name, true);
          api.setVisible(name, false);
        }
      }
      this.adapter.hideDuplicateBoundaryLabels();
    });
    const allUnlinked = [...targetPoints, ...targetCircles];
    if (this.selectedNames.length > 1) {
      this.select(null);
    }
    this.drawingFeedback = `Đã xóa liên kết ${allUnlinked.join(", ")} · kéo tự do từng đối tượng.`;
    this.emit();
    return allUnlinked;
  }
  deletionImpact(names = this.selectedNames) {
    return affectedByDeletion(this.objects, names);
  }
  deleteSelection() {
    const names = [...this.selectedNames];
    this.mutate(() => {
      for (const name of names)
        if (this.adapter.api.exists(name)) this.adapter.api.deleteObject(name);
    });
    this.select(null);
  }
  setMode(id: number) {
    this.drawingFeedback = "";
    this.adapter.api.setMode(id);
    this.mode = id;
    this.select(null);
    this.emit();
  }
  private flush() {
    clearTimeout(this.timer);
    if (!this.paused && !this.loading)
      this.history.push(this.adapter.snapshot());
  }
  mutate(fn: () => void) {
    if (this.loading) throw new Error("Đang mở tài liệu, vui lòng đợi.");
    this.flush();
    const before = this.adapter.snapshot();
    this.paused = true;
    try {
      fn();
      this.adapter.ensureBisectorMarks();
      this.adapter.formatSegmentLabels();
      this.adapter.formatPointLabels();
      this.history.push(this.adapter.snapshot());
    } catch (e) {
      this.adapter.restore(before);
      throw e;
    } finally {
      this.paused = false;
      this.sync();
    }
  }
  apply(actions: GeometryAction[], checks: GeometryCheck[] = []) {
    const history = actions.find((action) => action.type === "history");
    if (history?.type === "history") {
      if (actions.length !== 1 || checks.length)
        throw new Error("Hoàn tác/làm lại phải là một thao tác lịch sử riêng.");
      this.historyTarget(history.direction);
      if (history.direction === "undo") this.undo();
      else this.redo();
      return;
    }
    // The AI contract stays bounded; manual batch styling can cover the full selection.
    if (actions.length > 32 && actions.some((a) => a.type !== "style"))
      throw new Error("Tối đa 32 thao tác dựng hình mỗi lần.");
    this.mutate(() => {
      for (let i = 0; i < actions.length; i += 32)
        executeActions(this.adapter, actions.slice(i, i + 32), i + 32 >= actions.length ? checks : []);
      validateGeometry(this.adapter, checks);
    });
  }
  get canMeasure() {
    return this.objects.some(o => ["segment", "angle", "text"].includes(o.type) && isMeasurementObject(this.adapter.api,o.name));
  }
  get measurementsVisible() {
    return this.objects.some(o => ["segment", "angle", "text"].includes(o.type) && measurementVisible(this.adapter.api, o.name));
  }
  setMeasurementsVisible(show: boolean) {
    this.mutate(() => {
      const api=this.adapter.api;
      const measurable=this.objects.filter(o => isMeasurementObject(api,o.name));
      const requested=measurable.filter(o => hasMeasurementIntent(api,o.name));
      for (const o of show && requested.length ? requested : measurable)
        if (show || measurementVisible(api,o.name)) setMeasurementVisible(api,o.name,show);
    });
  }
  setCoordinateAxes(visible: boolean) {
    this.mutate(() => this.adapter.setCoordinateAxes(visible));
    if (visible) this.adapter.resetView();
    this.sync();
  }
  captureHistory() { this.flush(); return this.history.capture(); }
  enterExpression(input: string) {
    const api = this.adapter.api, compiled = compileExpression(input, api);
    if (compiled.label && api.exists(compiled.label)) {
      if (!canEditExpression(api, compiled.label)) throw new Error("Đối tượng này phụ thuộc phép dựng. Hãy sửa đối tượng gốc hoặc xóa liên kết trước.");
      if (/<fixed\b[^>]*val="true"/.test(api.getXML(compiled.label))) throw new Error("Đối tượng đang khóa. Hãy mở khóa trước khi sửa công thức.");
    }
    const before = new Map(api.getAllObjectNames().map(name => [name, api.getObjectType(name)]));
    let labels: string[] = [];
    this.mutate(() => {
      labels = String(api.evalCommandGetLabels(compiled.command) || "").split(",").map(name => name.trim()).filter(Boolean);
      if (!labels.length) throw new Error("GeoGebra không nhận công thức này. Hãy kiểm tra dấu ngoặc và các tham số.");
      for (const [name, type] of before) {
        if (!api.exists(name) || api.getObjectType(name) !== type) throw new Error("Công thức làm thay đổi loại hoặc xóa đối tượng đang có. Hình cũ được giữ nguyên.");
      }
      for (const name of api.getAllObjectNames()) {
        if (!api.isDefined(name) || (api.getObjectType(name) === "numeric" && !Number.isFinite(api.getValue(name)))) throw new Error("Công thức tạo giá trị không xác định. Hình cũ được giữ nguyên.");
        if (!before.has(name)) {
          this.adapter.color(name, "#23232D"); api.setLineThickness(name, 2); api.setLabelVisible(name, api.getObjectType(name) === "point"); api.setFixed(name, false, true);
        }
      }
      // Geometry mode defaults algebra-created graphs to fixed again on redefine.
      // An existing explicit lock was checked above; keep editable inputs editable.
      for (const name of labels) api.setFixed(name, false, true);
    });
    this.setMode(0);
    this.selectMany(labels);
    if (labels.some(name => api.getObjectType(name) !== "numeric")) this.adapter.resetView();
    this.sync();
    return labels;
  }
  historyTarget(direction: "undo" | "redo") {
    this.flush();
    const xml = this.history.peek(direction);
    if (!xml) throw new Error(direction === "undo" ? "Không còn thao tác để hoàn tác." : "Không còn thao tác để làm lại.");
    return xml;
  }
  newDocument() {
    this.documentGeneration++;
    this.mutate(() => {
      this.adapter.api.newConstruction();
      this.adapter.configureView();
      this.adapter.resetView();
    });
    this.select(null);
  }
  async openDocument(data: string) {
    if (this.loading) throw new Error("Đang mở tài liệu, vui lòng đợi.");
    if (!/^UEs[A-Za-z0-9+/=\r\n]+$/.test(data) || data.length > 20_000_000)
      throw new Error("Tệp GeoGebra không hợp lệ hoặc quá lớn.");
    clearTimeout(this.timer);
    const before = this.adapter.snapshot();
    this.paused = true;
    this.loading = true;
    this.emit();
    const generation = ++this.loadGeneration;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Không thể mở tệp GeoGebra này.")),
          15000,
        );
        try {
          this.adapter.api.setBase64(data, () => {
            clearTimeout(timeout);
            if (this.disposed || generation !== this.loadGeneration) {
              reject(new Error("Thao tác mở tệp đã hủy."));
              return;
            }
            resolve();
          });
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });
      this.adapter.api.setPerspective("G");
      this.adapter.api.setRounding("2");
      this.adapter.ensureBisectorMarks();
      this.adapter.formatSegmentLabels();
      this.adapter.formatPointLabels();
      this.adapter.hideDuplicateBoundaryLabels();
      this.documentGeneration++;
      this.history.reset(this.adapter.snapshot());
      this.saved = constructionKey(this.adapter.snapshot());
      this.selection = null;
    } catch (e) {
      if (!this.disposed) this.adapter.restore(before);
      throw e;
    } finally {
      this.loading = false;
      this.paused = false;
      this.sync();
    }
  }
  undo() {
    if (this.loading) return;
    this.flush();
    const xml = this.history.undo();
    if (xml) this.loadHistory(xml);
  }
  redo() {
    if (this.loading) return;
    clearTimeout(this.timer);
    const xml = this.history.redo();
    if (xml) this.loadHistory(xml);
  }
  private loadHistory(xml: string) {
    clearTimeout(this.timer);
    this.paused = true;
    try {
      this.adapter.restore(xml);
      this.select(null);
    } finally {
      this.paused = false;
      clearTimeout(this.timer);
      this.sync();
      this.history.replaceCurrent(this.adapter.snapshot());
    }
  }
  get dirty() {
    return constructionKey(this.adapter.snapshot()) !== this.saved;
  }
  markSaved(key = constructionKey(this.adapter.snapshot())) {
    this.saved = key;
    this.emit();
  }
  dispose() {
    this.disposed = true;
    this.loadGeneration++;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    const a = this.adapter.api;
    a.unregisterAddListener(this.added);
    a.unregisterRemoveListener(this.changed);
    a.unregisterUpdateListener(this.changed);
    a.unregisterClearListener(this.changed);
    a.unregisterRenameListener(this.renamed);
    a.unregisterClickListener(this.clicked);
    a.unregisterClientListener(this.client);
    this.listeners.clear();
  }
}
