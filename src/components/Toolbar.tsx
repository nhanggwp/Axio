import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  polygonPresets,
  type PolygonPresetId,
} from "../geometry/polygonPresets";
import { toolGroups } from "../geometry/tools";
import { Icon, IconButton } from "./Icon";
export function Toolbar({
  disabled,
  onTool,
  onPreset,
  mode,
}: {
  disabled: boolean;
  mode: number;
  onTool: (id: number, label: string, hint: string) => void;
  onPreset?: (id: PolygonPresetId, label: string, hint: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null),
    flyout = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = flyout.current,
      button = anchor.current;
    if (open === null || !menu || !button) return;
    const rect = button.getBoundingClientRect(),
      mobile = window.innerWidth <= 600;
    menu.style.left = `${Math.max(8, Math.min(mobile ? rect.left : rect.right + 8, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(mobile ? rect.bottom + 8 : rect.top, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => setOpen(null);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);
  return (
    <nav
      className="toolbar"
      aria-label="Công cụ hình học"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(null);
          event.stopPropagation();
        }
      }}
    >
      {toolGroups.map((g, i) => (
        <div className={`tool-group group-${i}`} key={g.title}>
          <IconButton
            icon={g.icon}
            label={g.title}
            disabled={disabled}
            className={g.tools.some((t) => t[1] === mode) ? "active" : ""}
            aria-expanded={open === i}
            onClick={(event) => {
              anchor.current = event.currentTarget;
              setOpen(open === i ? null : i);
            }}
          />
          {open === i &&
            createPortal(
              <>
                <button
                  className="flyout-dismiss"
                  aria-label="Đóng trình đơn công cụ"
                  onClick={() => setOpen(null)}
                />
                <div
                  ref={flyout}
                  role="dialog"
                  aria-label={g.title}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setOpen(null);
                      anchor.current?.focus();
                    }
                  }}
                  className={`tool-flyout ${g.title === "ĐA GIÁC" ? "polygon-flyout" : ""}`}
                >
                  <p className="eyebrow purple">{g.title}</p>
                  {g.tools.map(([label, id, hint]) => (
                    <button
                      key={id}
                      className={id === mode ? "chosen" : ""}
                      onClick={() => {
                        onTool(id, label, hint);
                        setOpen(null);
                      }}
                    >
                      <Icon name={g.icon} />
                      {label}
                    </button>
                  ))}
                  {g.title === "ĐA GIÁC" && onPreset && (
                    <>
                      <p className="eyebrow purple flyout-subhead">
                        MẪU ĐA GIÁC ĐỘNG
                      </p>
                      <div className="polygon-preset-grid">
                        {polygonPresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => {
                              onPreset(preset.id, preset.label, preset.hint);
                              setOpen(null);
                            }}
                          >
                            <Icon name="polygon" />
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <small>
                    Chọn công cụ hoặc chèn mẫu đa giác rồi kéo chỉnh trên vùng
                    vẽ.
                  </small>
                </div>
              </>,
              document.body,
            )}
        </div>
      ))}
    </nav>
  );
}
