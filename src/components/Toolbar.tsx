import { useState } from "react";
import { toolGroups } from "../geometry/tools";
import { Icon, IconButton } from "./Icon";
export function Toolbar({
  disabled,
  onTool,
  mode,
}: {
  disabled: boolean;
  mode: number;
  onTool: (id: number, label: string, hint: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <nav className="toolbar" aria-label="Công cụ hình học">
      {toolGroups.map((g, i) => (
        <div className={`tool-group group-${i}`} key={g.title}>
          <IconButton
            icon={g.icon}
            label={g.title}
            disabled={disabled}
            className={g.tools.some((t) => t[1] === mode) ? "active" : ""}
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          />
          {open === i && (
            <>
              <button
                className="flyout-dismiss"
                aria-label="Đóng trình đơn công cụ"
                onClick={() => setOpen(null)}
              />
              <div className="tool-flyout">
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
                <small>Chọn công cụ rồi thao tác trên vùng vẽ.</small>
              </div>
            </>
          )}
        </div>
      ))}
    </nav>
  );
}
