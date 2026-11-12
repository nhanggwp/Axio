import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
export function EditorMenu({
  disabled,
  accountPending,
  accountLabel,
  onDocuments,
  onAccount,
  onSavedDocuments,
  onExport,
  onShare,
  onWelcome,
  canRedo,
  onRedo,
}: {
  canRedo: boolean;
  onRedo: () => void;
  disabled: boolean;
  accountPending: boolean;
  accountLabel: string;
  onDocuments: () => void;
  onAccount: () => void;
  onSavedDocuments: () => void;
  onExport: () => void;
  onShare: () => void;
  onWelcome: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []).find(button => button.getClientRects().length > 0)?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <div className="editor-menu" ref={root}>
      <button
        className="editor-menu-trigger"
        ref={trigger}
        aria-label="Thao tác khác"
        title="Thao tác khác"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <section
          ref={panel}
          className="editor-menu-panel"
          role="dialog"
          aria-label="Thao tác bản vẽ"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <strong>Bản vẽ của bạn</strong>
          <button
            className="menu-redo"
            disabled={!canRedo}
            onClick={() => act(onRedo)}
          >
            Làm lại
          </button>
          <button disabled={disabled} onClick={() => act(onDocuments)}>
            Lưu và mở tài liệu
          </button>
          <button disabled={disabled} onClick={() => act(onSavedDocuments)}>
            Tài liệu của tôi
          </button>
          <button disabled={disabled} onClick={() => act(onExport)}>
            Xuất ảnh hoặc tệp
          </button>
          <button disabled={disabled} onClick={() => act(onShare)}>
            Chia sẻ hình
          </button>
          <button disabled={accountPending} onClick={() => act(onAccount)}>
            {accountLabel}
          </button>
          <div className="editor-menu-help">
            <button onClick={() => act(onWelcome)}>Chào mừng tới Axio</button>
            <a href="/huong-dan/" target="_blank" rel="noreferrer">
              Video hướng dẫn sử dụng ↗
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
