import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import type { HistorySnapshot } from "../geometry/ConstructionHistory";
import type { useWorkspace } from "../workspace/useWorkspace";
import { emptyChat, journalSchema, restoredChat, sessionMeta, type ChatBridge, type ChatDraft, type SessionMeta, type SessionRecord } from "./model";
import { deleteSession, listSessions, readSession, writeSession } from "./storage";
const activeKey = "axio-active-session", journalKey = "axio-working-draft";
type Options = {
  controller?: GeometryController; title: string; setTitle: (title: string) => void;
  userId?: string; identityReady: boolean; workspace: ReturnType<typeof useWorkspace>;
  chat: RefObject<ChatBridge | null>; blocked: boolean; onActivated: () => void;
};
type Journal = { sessionId: string; baseVersion: number; xml: string; title: string; savedKey: string; chat: ChatDraft; binding: SessionRecord["binding"]; updatedAt: string };
function readJournal(): Journal | null {
  try { const value = journalSchema.safeParse(JSON.parse(sessionStorage.getItem(journalKey) || "null")); return value.success ? value.data : null; } catch { return null; }
}
function readable(error: unknown) {
  return error instanceof DOMException && error.name === "QuotaExceededError" ? "Bộ nhớ trình duyệt đã đầy. Hãy xuất tệp hoặc xóa phiên không cần dùng rồi thử lại." : error instanceof Error ? error.message : "Không thể lưu phiên vào trình duyệt.";
}
export function useEditorSessions(options: Options) {
  const live = useRef(options); live.current = options;
  const [sessions, setSessions] = useState<SessionMeta[]>([]), [activeId, setActiveId] = useState<string>(),
    [chatState, setChatState] = useState<{ key: string; draft: ChatDraft }>(),
    [busy, setBusy] = useState(true), [ready, setReady] = useState(false), [available, setAvailable] = useState(false),
    [saving, setSaving] = useState(false), [pendingSave, setPendingSave] = useState(false), [error, setError] = useState("");
  const active = useRef<SessionRecord | null>(null), busyRef = useRef(true), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    writing = useRef<Promise<SessionRecord> | null>(null), changes = useRef(0), lastWritten = useRef(""), histories = useRef(new Map<string, HistorySnapshot>()), initialized = useRef<GeometryController | undefined>(undefined);
  const binding = (): SessionRecord["binding"] => {
    const { workspace, userId } = live.current;
    const document = workspace.current();
    if (!document || !userId) return null;
    const { id, title, version, updatedAt, createdAt } = document;
    return { ownerId: userId, document: { id, title, version, updatedAt, createdAt } };
  };
  const fingerprint = () => {
    const { controller, title, chat } = live.current;
    return controller ? JSON.stringify({ xml: controller.adapter.snapshot(), title, savedKey: controller.saved, chat: chat.current?.capture() ?? emptyChat(), binding: binding() }) : "";
  };
  const journal = () => {
    const current = active.current, { controller, title, chat } = live.current;
    if (!current || !controller) return;
    const value: Journal = { sessionId: current.id, baseVersion: current.version, xml: controller.adapter.snapshot(), title, savedKey: controller.saved, chat: chat.current?.capture() ?? emptyChat(), binding: binding(), updatedAt: new Date().toISOString() };
    try { sessionStorage.setItem(journalKey, JSON.stringify(value)); } catch {}
  };
  const capture = async (meta: SessionMeta | null = active.current): Promise<SessionRecord> => {
    const { controller, title, chat } = live.current;
    if (!controller || !meta) throw new Error("Phiên chưa sẵn sàng.");
    histories.current.set(meta.id, controller.captureHistory());
    const before = { ...meta, documentTitle: title, savedKey: controller.saved, chat: chat.current?.capture() ?? emptyChat(), binding: binding(), objectCount: controller.objects.length, updatedAt: new Date().toISOString() };
    return { ...before, messageCount: before.chat.messages.length, data: await controller.adapter.base64() };
  };
  const refresh = async () => { const list = await listSessions(); setSessions(list); return list; };
  const persist = async (): Promise<SessionRecord> => {
    const previous = writing.current;
    const task = (async () => {
      if (previous) await previous.catch(() => {});
      const key = fingerprint();
      if (active.current && key === lastWritten.current) { setPendingSave(false); sessionStorage.removeItem(journalKey); return active.current; }
      setSaving(true);
      const stamp = changes.current, record = await capture();
      const saved = await writeSession(record, record.version);
      active.current = saved;
      lastWritten.current = key;
      setSessions((rows) => rows.map((row) => row.id === saved.id ? sessionMeta(saved) : row));
      if (stamp === changes.current) { sessionStorage.removeItem(journalKey); setPendingSave(false); }
      else journal();
      setError("");
      return saved;
    })();
    writing.current = task;
    try { return await task; } finally { if (writing.current === task) { writing.current = null; setSaving(false); } }
  };
  const persistRef = useRef(persist); persistRef.current = persist;
  const journalRef = useRef(journal); journalRef.current = journal;
  const fingerprintRef = useRef(fingerprint); fingerprintRef.current = fingerprint;
  const schedule = useCallback(() => {
    if (busyRef.current || !active.current) return;
    if (fingerprintRef.current() === lastWritten.current && !writing.current) { clearTimeout(timer.current); setPendingSave(false); sessionStorage.removeItem(journalKey); return; }
    changes.current++;
    setPendingSave(true);
    journalRef.current();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = undefined; void persistRef.current().catch((e) => setError(readable(e))); }, 800);
  }, []);
  const activate = async (record: SessionRecord, alreadyLoaded = false, recovery?: Journal) => {
    const { controller, workspace, userId, setTitle, onActivated } = live.current;
    if (!controller) throw new Error("Vùng vẽ chưa sẵn sàng.");
    workspace.detach();
    if (!alreadyLoaded) await controller.openDocument(record.data);
    if (recovery) {
      controller.mutate(() => controller.adapter.restore(recovery.xml));
      record = { ...record, version: recovery.baseVersion, documentTitle: recovery.title, savedKey: recovery.savedKey, chat: recovery.chat, binding: recovery.binding, objectCount: controller.objects.length };
    }
    const history = histories.current.get(record.id);
    if (history) controller.history.restore(history);
    else controller.history.reset(controller.adapter.snapshot());
    controller.markSaved(record.savedKey);
    setTitle(record.documentTitle);
    workspace.restore(record.binding && record.binding.ownerId === userId ? record.binding.document : null);
    record = { ...record, chat: restoredChat(record.chat) };
    lastWritten.current = JSON.stringify({ xml: controller.adapter.snapshot(), title: record.documentTitle, savedKey: record.savedKey, chat: record.chat, binding: record.binding?.ownerId === userId ? record.binding : null });
    setPendingSave(false);
    active.current = record;
    sessionStorage.setItem(activeKey, record.id);
    setActiveId(record.id);
    setChatState({ key: crypto.randomUUID(), draft: record.chat });
    onActivated();
    controller.sync();
  };
  const activateRef = useRef(activate); activateRef.current = activate;
  useEffect(() => {
    const { controller, identityReady } = options;
    if (!controller || !identityReady || initialized.current === controller) return;
    initialized.current = controller;
    busyRef.current = true; setBusy(true);
    void (async () => {
      const rows = await refresh();
      const selected = sessionStorage.getItem(activeKey);
      const meta = rows.find((r) => r.id === selected) ?? rows.at(-1);
      if (meta) {
        const record = await readSession(meta.id), recovery = readJournal();
        await activateRef.current(record, false, recovery?.sessionId === record.id && recovery.updatedAt > record.updatedAt ? recovery : undefined);
      } else {
        const now = new Date().toISOString();
        const initial: SessionMeta = { id: crypto.randomUUID(), name: "Phiên 1", version: 0, createdAt: now, updatedAt: now, objectCount: 0, messageCount: 0 };
        const captured = await capture(initial);
        active.current = captured;
        journalRef.current();
        const saved = await writeSession(captured, 0);
        active.current = saved;
        lastWritten.current = fingerprintRef.current();
        sessionStorage.removeItem(journalKey);
        sessionStorage.setItem(activeKey, saved.id);
        setActiveId(saved.id);
        setChatState({ key: crypto.randomUUID(), draft: saved.chat });
        await refresh();
      }
      setAvailable(true);
    })().catch((e) => setError(readable(e))).finally(() => { busyRef.current = false; setBusy(false); setReady(true); });
  }, [options.controller, options.identityReady]);
  useEffect(() => {
    if (!options.controller) return;
    const controller = options.controller;
    let revision = controller.revision, view = controller.viewRevision;
    return controller.subscribe(() => { if (revision !== controller.revision || view !== controller.viewRevision) { revision = controller.revision; view = controller.viewRevision; schedule(); } });
  }, [options.controller, schedule]);
  useEffect(() => { if (ready && !busy) schedule(); }, [options.title, options.userId, options.workspace.active, ready, busy, schedule]);
  useEffect(() => () => { clearTimeout(timer.current); if (!busyRef.current) journalRef.current(); }, []);
  const transition = async (action: () => Promise<void>) => {
    const current = live.current;
    if (busyRef.current || !available) return false;
    if (current.blocked || current.chat.current?.busy || current.controller?.loading) { setError("Hãy dừng phản hồi và áp dụng hoặc bỏ bản xem trước trước khi chuyển phiên."); return false; }
    busyRef.current = true; setBusy(true); setError(""); clearTimeout(timer.current);
    current.workspace.pauseAutosave();
    try { await current.workspace.waitForIdle(); if (writing.current) await writing.current.catch(() => {}); await action(); await refresh(); return true; }
    catch (e) { setError(readable(e)); return false; }
    finally { busyRef.current = false; setBusy(false); live.current.workspace.resumeAutosave(); }
  };
  const nextName = () => { let n = 1; while (sessions.some((s) => s.name === `Phiên ${n}`)) n++; return `Phiên ${n}`; };
  const blank = async (): Promise<SessionRecord> => {
    const controller = live.current.controller!;
    controller.newDocument(); controller.history.reset(controller.adapter.snapshot()); controller.markSaved();
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), name: nextName(), version: 0, createdAt: now, updatedAt: now, objectCount: 0, messageCount: 0, documentTitle: "Hình dựng mới", savedKey: controller.saved, chat: emptyChat(), binding: null, data: await controller.adapter.base64() };
  };
  const create = () => transition(async () => {
    const before = await persistRef.current();
    try { const record = await writeSession(await blank(), 0); await activate(record, true); }
    catch (e) { await activate(before); throw e; }
  });
  const select = (id: string) => id === active.current?.id ? Promise.resolve(true) : transition(async () => {
    const before = await persistRef.current();
    try { await activate(await readSession(id)); }
    catch (e) { await activate(before); throw e; }
  });
  const duplicate = () => transition(async () => {
    await persistRef.current().catch(() => {});
    const current = await capture(), now = new Date().toISOString();
    const copy = await writeSession({ ...current, id: crypto.randomUUID(), version: 0, name: `${current.name.slice(0, 65)} (bản sao)`, createdAt: now, updatedAt: now, binding: null }, 0);
    histories.current.set(copy.id, live.current.controller!.captureHistory());
    await activate(copy, true);
  });
  const rename = (id: string, name: string) => transition(async () => {
    const trimmed = name.trim(); if (!trimmed || trimmed.length > 80) throw new Error("Tên phiên cần từ 1 đến 80 ký tự.");
    const record = id === active.current?.id ? await persistRef.current() : await readSession(id);
    const updated = await writeSession({ ...record, name: trimmed, updatedAt: new Date().toISOString() }, record.version);
    if (active.current?.id === id) active.current = updated;
  });
  const remove = (meta: SessionMeta) => transition(async () => {
    if (meta.id !== active.current?.id) { await deleteSession(meta); histories.current.delete(meta.id); return; }
    const before = await capture(), other = sessions.find((s) => s.id !== meta.id);
    try {
      if (other) { await activate(await readSession(other.id)); await deleteSession(sessionMeta(before)); }
      else { const replacement = await writeSession(await blank(), 0, sessionMeta(before)); await activate(replacement, true); }
      histories.current.delete(meta.id);
    } catch (e) { await activate(before); throw e; }
  });
  const retrySave = () => transition(async () => { await persistRef.current(); });
  return { sessions, activeId, chatKey: chatState?.key, initialChat: chatState?.draft, busy, ready: ready && available, saving, pendingSave, error, create, select, duplicate, rename, remove, retrySave, changed: schedule };
}
