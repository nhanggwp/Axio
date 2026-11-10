import { geometryNames } from "../../shared/geometryNames";
import { GeoGebraAdapter } from "./GeoGebraAdapter";
import { ConstructionHistory } from "./ConstructionHistory";
import { executeActions } from "./CommandExecutor";
import { validateGeometry } from "./GeometryChecks";
import { constructionKey, normalizeClientEvent } from "./GeometryState";
import { SelectionManager, affectedByDeletion } from "./SelectionManager";
import { selectionBounds } from "./ScreenProjection";
import { isPolygonType } from "./triangleVertices";
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
      | { kind: "rotate_driver"; anchor: string; driver: string; ax: number; ay: number; rDriver: number; deltaAngle: number }
      | { kind: "translate_group"; freePoints: PointSnapshot[]; pathPoints: PointSnapshot[] }
      | null;
    hiddenHelpers?: { name: string; dx: number; dy: number }[];
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
    adapter.formatSegmentLabels();
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
    this.adapter.formatSegmentLabels();
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
    if (this.pointer?.hiddenHelpers?.length && this.pointer.hit && this.adapter.api.exists(this.pointer.hit)) {
      const api = this.adapter.api, ax = api.getXcoord(this.pointer.hit), ay = api.getYcoord(this.pointer.hit);
      for (const h of this.pointer.hiddenHelpers) if (api.exists(h.name) && Math.hypot(api.getXcoord(h.name) - (ax + h.dx), api.getYcoord(h.name) - (ay + h.dy)) > 1e-7) api.setCoords(h.name, ax + h.dx, ay + h.dy);
    }
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.sync);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.dragging) this.history.push(this.adapter.snapshot());
      this.emit();
    }, 350);
  };
  private added = (name: string) => {
    if (this.paused || this.disposed) return;
    const a = this.adapter.api,
      type = a.getObjectType(name),
      polygon = isPolygonType(type);
    this.adapter.color(name, polygon ? "#C9E1E6" : "#23232D");
    a.setLineThickness(name, 2);
    if (polygon) a.setFilling(name, 0.18);
    if (type === "point") a.setPointSize(name, 3);
    a.setLabelVisible(name, ["point", "segment", "angle"].includes(type));
    if (type === "segment") {
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
    if (!api.exists(hit) || this.isDirectPoint(hit)) return null;
    const type = api.getObjectType(hit);
    if (type === "point") {
      const visibleRoots: string[] = [], drivers: string[] = [], visited = new Set<string>();
      const visit = (target: string) => {
        if (visited.has(target) || !api.exists(target)) return;
        visited.add(target);
        if (this.isDirectPoint(target)) {
          if (api.isIndependent(target) && api.getVisible(target)) visibleRoots.push(target);
          else drivers.push(target);
          if (api.isIndependent(target)) return;
        }
        for (const input of geometryNames(api.getCommandString(target, false))) if (input !== target) visit(input);
      };
      visit(hit);
      if (visibleRoots.length === 1 && drivers.length === 1) {
        const anchor = visibleRoots[0], driver = drivers[0];
        const ax = api.getXcoord(anchor), ay = api.getYcoord(anchor), dx = api.getXcoord(driver), dy = api.getYcoord(driver), hx = api.getXcoord(hit), hy = api.getYcoord(hit);
        const rDriver = Math.hypot(dx - ax, dy - ay), rHit = Math.hypot(hx - ax, hy - ay);
        if (rDriver > 1e-6 && rHit > 1e-6) {
          return {
            kind: "rotate_driver" as const,
            anchor,
            driver,
            ax,
            ay,
            rDriver,
            deltaAngle: Math.atan2(dy - ay, dx - ax) - Math.atan2(hy - ay, hx - ax),
          };
        }
      }
      const comp = this.connectedComponent([hit]);
      const { freePoints, pathPoints } = this.collectGroupSnapshots(comp);
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
    const hiddenHelpers = this.mode === 0 && !modified && hit && api.exists(hit) && api.getObjectType(hit) === "point" && api.isIndependent(hit) && api.isMoveable(hit)
      ? api.getAllObjectNames("point").filter((n) => n !== hit && api.isIndependent(n) && api.isMoveable(n) && !api.getVisible(n)).map((name) => ({ name, dx: api.getXcoord(name) - api.getXcoord(hit), dy: api.getYcoord(name) - api.getYcoord(hit) }))
      : [];
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
      hiddenHelpers,
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
      if (proxy.kind === "rotate_driver") {
        const angle = Math.atan2(wy - proxy.ay, wx - proxy.ax) + proxy.deltaAngle;
        api.setCoords(proxy.driver, proxy.ax + proxy.rDriver * Math.cos(angle), proxy.ay + proxy.rDriver * Math.sin(angle));
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
    if (this.mode === 0 && p?.modified && p.hit && !p.moved)
      this.selectMany(
        p.before.includes(p.hit)
          ? p.before.filter((n) => n !== p.hit)
          : [...p.before, p.hit],
      );
    else if (this.mode === 0 && p?.proxy && p.hit && !p.moved && !p.modified)
      this.select(p.hit);
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
      this.adapter.formatSegmentLabels();
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
    // The AI contract stays bounded; manual batch styling can cover the full selection.
    if (actions.length > 32 && actions.some((a) => a.type !== "style"))
      throw new Error("Tối đa 32 thao tác dựng hình mỗi lần.");
    this.mutate(() => {
      for (let i = 0; i < actions.length; i += 32)
        executeActions(this.adapter, actions.slice(i, i + 32));
      validateGeometry(this.adapter, checks);
    });
  }
  captureHistory() { this.flush(); return this.history.capture(); }
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
      this.adapter.formatSegmentLabels();
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
