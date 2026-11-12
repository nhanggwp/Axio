import { useEffect, useRef, useState } from "react";
import type { useEditorSessions } from "./useEditorSessions";
import type { SessionMeta } from "./model";
import { Icon, IconButton } from "../components/Icon";
export function SessionControls({
  manager,
  disabled,
}: {
  manager: ReturnType<typeof useEditorSessions>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [renaming, setRenaming] = useState<string | null>(null),
    [name, setName] = useState(""),
    [deleting, setDeleting] = useState<SessionMeta | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false),
    [search, setSearch] = useState("");
  const switcher = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const active = manager.sessions.find((s) => s.id === manager.activeId);
  const status = manager.error
    ? "Chưa lưu phiên"
    : manager.saving || manager.pendingSave
      ? "Đang lưu phiên…"
      : manager.ready
        ? "Đã lưu phiên cục bộ"
        : "Đang mở phiên…";
  useEffect(() => {
    if (!chooserOpen) return;
    searchInput.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!switcher.current?.contains(event.target as Node))
        setChooserOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [chooserOpen]);
  const tabs = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open)
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  useEffect(() => {
    const element = tabs.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [manager.activeId, chooserOpen]);
  const run = async (action: () => Promise<boolean>) => {
    if (await action()) {
      setRenaming(null);
      setDeleting(null);
    }
  };
  return (
    <>
      <div className="session-switcher" ref={switcher}>
        <button
          ref={trigger}
          className="session-switcher-trigger"
          aria-label="Chọn phiên làm việc"
          aria-haspopup="dialog"
          aria-expanded={chooserOpen}
          title={active?.name || "Phiên làm việc"}
          onClick={() => {
            setChooserOpen(!chooserOpen);
            setSearch("");
          }}
        >
          <Icon name="sessions" />
          <span className="session-current-name">
            {active?.name || "Phiên làm việc"}
          </span>
          <span
            className={`session-save-dot${manager.error ? " error" : manager.pendingSave || manager.saving ? " saving" : ""}`}
            title={status}
            aria-hidden="true"
          />
          <Icon name="chevron" />
        </button>
        <span className="session-save-status sr-only" role="status">
          {status}
        </span>
        <IconButton
          icon="plus"
          className="session-new"
          label="Tạo phiên mới"
          disabled={disabled}
          onClick={() =>
            void manager.create().then((ok) => {
              if (ok) setChooserOpen(false);
            })
          }
        />
        {chooserOpen && (
          <section
            className="session-chooser"
            role="dialog"
            aria-label="Chọn phiên làm việc"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setChooserOpen(false);
                trigger.current?.focus();
              }
              if (
                disabled ||
                ![
                  "ArrowUp",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                ].includes(event.key)
              )
                return;
              if (
                event.target instanceof HTMLInputElement &&
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const rows = manager.sessions.filter((s) =>
                s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
              );
              const index = rows.findIndex((s) => s.id === manager.activeId);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? rows.length - 1
                    : (index +
                        (["ArrowRight", "ArrowDown"].includes(event.key)
                          ? 1
                          : -1) +
                        rows.length) %
                      rows.length;
              const session = rows[next];
              if (session)
                void manager.select(session.id).then((ok) => {
                  if (ok)
                    tabs.current
                      ?.querySelector<HTMLElement>('[aria-selected="true"]')
                      ?.focus();
                });
            }}
          >
            <div className="session-chooser-heading">
              <strong>Phiên làm việc</strong>
              <span>{manager.sessions.length}</span>
            </div>
            <label className="session-search">
              <Icon name="search" />
              <input
                ref={searchInput}
                type="search"
                aria-label="Tìm phiên làm việc"
                placeholder="Tìm phiên…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div
              className="session-tabs"
              ref={tabs}
              role="tablist"
              aria-label="Phiên làm việc"
              aria-orientation="vertical"
            >
              {manager.sessions
                .filter((s) =>
                  s.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
                )
                .map((session) => (
                  <button
                    key={session.id}
                    role="tab"
                    aria-label={session.name}
                    aria-selected={session.id === manager.activeId}
                    tabIndex={session.id === manager.activeId ? 0 : -1}
                    disabled={disabled}
                    title={session.name}
                    className={session.id === manager.activeId ? "active" : ""}
                    onClick={() =>
                      void manager.select(session.id).then((ok) => {
                        if (ok) {
                          setChooserOpen(false);
                          trigger.current?.focus();
                        }
                      })
                    }
                  >
                    <Icon
                      name={
                        session.id === manager.activeId ? "check" : "sessions"
                      }
                    />
                    <span>
                      <b>{session.name}</b>
                      <small>
                        {session.objectCount} đối tượng · {session.messageCount}{" "}
                        tin nhắn
                      </small>
                    </span>
                  </button>
                ))}
              {!manager.sessions.some((s) =>
                s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
              ) && (
                <p className="session-empty">Không tìm thấy phiên phù hợp.</p>
              )}
            </div>
            {manager.error && (
              <p className="session-inline-error" role="alert">
                {manager.error}
              </p>
            )}
            {disabled && !manager.busy && (
              <small>
                Áp dụng hoặc bỏ bản xem trước trước khi chuyển phiên.
              </small>
            )}
            <div className="session-chooser-actions">
              <button
                disabled={disabled}
                onClick={() =>
                  void manager.create().then((ok) => {
                    if (ok) setChooserOpen(false);
                  })
                }
              >
                <Icon name="plus" />
                Phiên mới
              </button>
              <button
                onClick={() => {
                  setChooserOpen(false);
                  setOpen(true);
                }}
                aria-label="Quản lý phiên"
              >
                <Icon name="more" />
                Quản lý
              </button>
            </div>
            <small className="session-storage-note">
              Hình vẽ và hội thoại riêng. Tự lưu trên trình duyệt này.
            </small>
          </section>
        )}
      </div>
      {open && (
        <div className="modal-backdrop">
          <section
            ref={dialog}
            className="document-dialog session-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Quản lý phiên"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                if (!manager.busy) setOpen(false);
              }
              if (event.key === "Tab") {
                const focusable = dialog.current?.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input:not(:disabled)",
                );
                const first = focusable?.[0],
                  last = focusable?.[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <header>
              <h2>Phiên làm việc</h2>
              <IconButton
                icon="close"
                label="Đóng quản lý phiên"
                disabled={manager.busy}
                onClick={() => {
                  setOpen(false);
                  setDeleting(null);
                  setRenaming(null);
                }}
              />
            </header>
            <p>
              Mỗi phiên có hình vẽ và hội thoại riêng, được lưu trên trình duyệt
              này. Lưu vào tài khoản qua “Tài liệu của tôi”.
            </p>
            <div className="actions">
              <button
                disabled={disabled}
                onClick={() => void run(manager.create)}
              >
                Phiên mới
              </button>
              <button
                disabled={disabled}
                onClick={() => void run(manager.duplicate)}
              >
                Nhân bản phiên hiện tại
              </button>
            </div>
            {manager.error && (
              <div className="error-card" role="alert">
                <p>{manager.error}</p>
                <button
                  disabled={disabled}
                  onClick={() => void run(manager.retrySave)}
                >
                  Thử lưu lại
                </button>
              </div>
            )}
            {disabled && !manager.busy && (
              <p>
                Hãy dừng phản hồi và áp dụng hoặc bỏ bản xem trước trước khi
                chuyển phiên.
              </p>
            )}
            <div className="session-list">
              {manager.sessions.map((session) => (
                <article
                  key={session.id}
                  className={session.id === manager.activeId ? "active" : ""}
                >
                  <button
                    disabled={disabled}
                    aria-label={`Mở phiên ${session.name}`}
                    onClick={() =>
                      void manager.select(session.id).then((ok) => {
                        if (ok) setOpen(false);
                      })
                    }
                  >
                    <b>{session.name}</b>
                    <small>
                      {session.objectCount} đối tượng · {session.messageCount}{" "}
                      tin nhắn
                    </small>
                    <small>
                      {new Date(session.updatedAt).toLocaleString("vi-VN")}
                    </small>
                  </button>
                  <div className="actions">
                    <button
                      disabled={disabled}
                      aria-label={`Đổi tên phiên ${session.name}`}
                      onClick={() => {
                        setRenaming(session.id);
                        setName(session.name);
                        setDeleting(null);
                      }}
                    >
                      Đổi tên
                    </button>
                    <IconButton
                      icon="delete"
                      label={`Xóa phiên ${session.name}`}
                      disabled={disabled}
                      onClick={() => {
                        setDeleting(session);
                        setRenaming(null);
                      }}
                    />
                  </div>
                  {renaming === session.id && (
                    <form
                      className="session-rename"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => manager.rename(session.id, name));
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Tên phiên mới"
                        value={name}
                        maxLength={80}
                        onChange={(event) => setName(event.target.value)}
                      />
                      <button disabled={disabled || !name.trim()} type="submit">
                        Lưu tên phiên
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
            {deleting && (
              <div className="session-delete">
                <p>
                  Xóa phiên “{deleting.name}” cùng hình và hội thoại đã lưu trên
                  trình duyệt? Tài liệu tài khoản vẫn được giữ.
                </p>
                <div className="actions">
                  <button disabled={disabled} onClick={() => setDeleting(null)}>
                    Giữ phiên
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => void run(() => manager.remove(deleting))}
                  >
                    Xóa phiên và nội dung
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
