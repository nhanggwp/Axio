import { GeoGebraAdapter } from "./GeoGebraAdapter";
import { ConstructionHistory } from "./ConstructionHistory";
import { executeActions } from "./CommandExecutor";
import { validateGeometry } from "./GeometryChecks";
import { constructionKey, normalizeClientEvent } from "./GeometryState";
import { SelectionManager, affectedByDeletion } from "./SelectionManager";
import type { GeometryAction, GeometryObject, GeometryCheck } from "../../shared/actions";
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
    moved: boolean;
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
      polygon = [
        "polygon",
        "triangle",
        "quadrilateral",
        "pentagon",
        "hexagon",
      ].includes(type);
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
  beginPointer(modified: boolean, hit: string | null, x: number, y: number) {
    this.pointer = {
      modified,
      before: [...this.selectedNames],
      hit,
      x,
      y,
      moved: false,
    };
    this.dragging = true;
  }
  movePointer(x: number, y: number) {
    if (this.pointer && Math.hypot(x - this.pointer.x, y - this.pointer.y) > 4)
      this.pointer.moved = true;
  }
  endPointer() {
    const p = this.pointer;
    this.dragging = false;
    this.pointer = null;
    if (this.mode === 0 && p?.modified && p.hit && !p.moved)
      this.selectMany(
        p.before.includes(p.hit)
          ? p.before.filter((n) => n !== p.hit)
          : [...p.before, p.hit],
      );
    this.flush();
    this.sync();
  }
  private clicked = (name: string) => {
    if (this.pointer) this.pointer.hit ??= name;
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
    if (e.type === "dragEnd" || e.type === "movedGeos") {
      this.dragging = false;
      this.flush();
      this.sync();
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
          /^[\p{L}][\p{L}\p{N}_]*$/u.test(n),
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
    this.paused = true;
    try {
      this.adapter.restore(xml);
    } finally {
      this.paused = false;
      this.select(null);
      this.sync();
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
