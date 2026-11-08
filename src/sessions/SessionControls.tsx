import { useEffect, useRef, useState } from "react";
import type { useEditorSessions } from "./useEditorSessions";
import type { SessionMeta } from "./model";
import { IconButton } from "../components/Icon";
export function SessionControls({ manager, disabled }: { manager: ReturnType<typeof useEditorSessions>; disabled: boolean }) {
  const [open, setOpen] = useState(false), [renaming, setRenaming] = useState<string | null>(null), [name, setName] = useState(""), [deleting, setDeleting] = useState<SessionMeta | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { if (open) dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  useEffect(() => {
    const element = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [manager.activeId]);
  const run = async (action: () => Promise<boolean>) => { if (await action()) { setRenaming(null); setDeleting(null); } };
  return <>
    <div className="session-strip">
      <div className="session-tabs" ref={tabs} role="tablist" aria-label="Phiên làm việc" onKeyDown={(event) => {
        if (disabled || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = manager.sessions.findIndex((s) => s.id === manager.activeId);
        const next = event.key === "Home" ? 0 : event.key === "End" ? manager.sessions.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + manager.sessions.length) % manager.sessions.length;
        const session = manager.sessions[next];
        if (session) void manager.select(session.id).then((ok) => { if (ok) tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(); });
      }}>
        {manager.sessions.map((session) => <button key={session.id} role="tab" aria-selected={session.id === manager.activeId} tabIndex={session.id === manager.activeId ? 0 : -1} disabled={disabled} title={session.name} className={session.id === manager.activeId ? "active" : ""} onClick={() => void manager.select(session.id)}>{session.name}</button>)}
      </div>
      <span className="session-save-status" role="status">{manager.error ? "Chưa lưu phiên" : manager.saving || manager.pendingSave ? "Đang lưu phiên…" : manager.ready ? "Đã lưu phiên cục bộ" : "Đang mở phiên…"}</span>
      <button disabled={disabled} onClick={() => void manager.create()} aria-label="Tạo phiên mới">+ Phiên mới</button>
      <IconButton icon="panel" label="Quản lý phiên" onClick={() => setOpen(true)} />
    </div>
    {open && <div className="modal-backdrop"><section ref={dialog} className="document-dialog session-dialog" role="dialog" aria-modal="true" aria-label="Quản lý phiên" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); if (!manager.busy) setOpen(false); }
      if (event.key === "Tab") {
        const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
        const first = focusable?.[0], last = focusable?.[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2>Phiên làm việc</h2><IconButton icon="close" label="Đóng quản lý phiên" disabled={manager.busy} onClick={() => { setOpen(false); setDeleting(null); setRenaming(null); }} /></header>
      <p>Mỗi phiên có hình vẽ và hội thoại riêng, được lưu trên trình duyệt này. Lưu vào tài khoản qua “Tài liệu của tôi”.</p>
      <div className="actions"><button disabled={disabled} onClick={() => void run(manager.create)}>Phiên mới</button><button disabled={disabled} onClick={() => void run(manager.duplicate)}>Nhân bản phiên hiện tại</button></div>
      {manager.error && <div className="error-card" role="alert"><p>{manager.error}</p><button disabled={disabled} onClick={() => void run(manager.retrySave)}>Thử lưu lại</button></div>}
      {disabled && !manager.busy && <p>Hãy dừng phản hồi và áp dụng hoặc bỏ bản xem trước trước khi chuyển phiên.</p>}
      <div className="session-list">
        {manager.sessions.map((session) => <article key={session.id} className={session.id === manager.activeId ? "active" : ""}>
          <button disabled={disabled} aria-label={`Mở phiên ${session.name}`} onClick={() => void manager.select(session.id).then((ok) => { if (ok) setOpen(false); })}><b>{session.name}</b><small>{session.objectCount} đối tượng · {session.messageCount} tin nhắn</small><small>{new Date(session.updatedAt).toLocaleString("vi-VN")}</small></button>
          <div className="actions"><button disabled={disabled} aria-label={`Đổi tên phiên ${session.name}`} onClick={() => { setRenaming(session.id); setName(session.name); setDeleting(null); }}>Đổi tên</button><IconButton icon="delete" label={`Xóa phiên ${session.name}`} disabled={disabled} onClick={() => { setDeleting(session); setRenaming(null); }} /></div>
          {renaming === session.id && <form className="session-rename" onSubmit={(event) => { event.preventDefault(); void run(() => manager.rename(session.id, name)); }}><input autoFocus aria-label="Tên phiên mới" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><button disabled={disabled || !name.trim()} type="submit">Lưu tên phiên</button></form>}
        </article>)}
      </div>
      {deleting && <div className="session-delete"><p>Xóa phiên “{deleting.name}” cùng hình và hội thoại đã lưu trên trình duyệt? Tài liệu tài khoản vẫn được giữ.</p><div className="actions"><button disabled={disabled} onClick={() => setDeleting(null)}>Giữ phiên</button><button disabled={disabled} onClick={() => void run(() => manager.remove(deleting))}>Xóa phiên và nội dung</button></div></div>}
    </section></div>}
  </>;
}
