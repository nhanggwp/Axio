import { useEffect, useRef, useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { circleBoundaryPoints } from "../geometry/RegionFill";
import { supportsFill } from "../geometry/GeometryState";
import { IconButton } from "./Icon";

export function RegionFillDialog({
  controller,
  onClose,
  onCreated,
}: {
  controller: GeometryController;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const objects = controller.objects,
    selected = controller.selectedNames;
  const circles = objects.filter((o) => o.type === "circle");
  const [kind, setKind] = useState<
    "circular_segment" | "circular_sector" | "existing"
  >(circles.length ? "circular_segment" : "existing");
  const [circle, setCircle] = useState(
    circles.find((o) => selected.includes(o.name))?.name ??
      circles[0]?.name ??
      "",
  );
  const candidates = circleBoundaryPoints(controller.adapter.api, circle);
  const initialPoints = [
    ...candidates.filter((n) => selected.includes(n)),
    ...candidates.filter((n) => !selected.includes(n)),
  ];
  const [a, setA] = useState(initialPoints[0] ?? ""),
    [b, setB] = useState(initialPoints[1] ?? "");
  const fillable = objects.filter((o) => supportsFill(o.type));
  const [target, setTarget] = useState(
    fillable.find((o) => selected.includes(o.name))?.name ??
      fillable[0]?.name ??
      "",
  );
  const [part, setPart] = useState<"minor" | "major">("minor");
  const [color, setColor] = useState("#09AFF0"),
    [opacity, setOpacity] = useState(45),
    [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLSelectElement>("select")?.focus();
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        ref={panel}
        className="document-dialog region-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const controls = Array.from(
              panel.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),select:not(:disabled),input:not(:disabled)",
              ) ?? [],
            );
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2 id="region-title">Tô vùng</h2>
          <IconButton icon="close" label="Đóng tô vùng" onClick={onClose} />
        </header>
        <p>
          Tô phần diện tích của hình. Vùng tô giữ liên kết với hình khi kéo các
          điểm.
        </p>
        <form
          className="region-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            try {
              let name = target;
              if (kind === "existing")
                controller.apply([
                  { type: "style", target, color, opacity: opacity / 100 },
                ]);
              else {
                let index = 1;
                while (controller.adapter.api.exists(`region${index}`)) index++;
                name = `region${index}`;
                controller.apply([
                  {
                    type: "construct",
                    kind,
                    label: name,
                    refs: [circle, a, b],
                    part,
                    auxiliary: false,
                  },
                  {
                    type: "style",
                    target: name,
                    color,
                    opacity: opacity / 100,
                  },
                ]);
              }
              controller.setMode(0);
              controller.select(name);
              onCreated(name);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Chưa thể tô vùng này.",
              );
            }
          }}
        >
          <label className="field">
            Loại vùng
            <select
              aria-label="Loại vùng tô"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="circular_segment">
                Hình viên phân · giữa cung và dây
              </option>
              <option value="circular_sector">
                Hình quạt tròn · hai bán kính và cung
              </option>
              <option value="existing">Tô đối tượng có sẵn</option>
            </select>
          </label>
          {kind === "existing" ? (
            <label className="field">
              Đối tượng
              <select
                aria-label="Đối tượng cần tô"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="" disabled>
                  Chọn đối tượng
                </option>
                {fillable.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.displayName ?? o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                Đường tròn
                <select
                  aria-label="Đường tròn giới hạn"
                  value={circle}
                  onChange={(e) => {
                    const value = e.target.value,
                      points = circleBoundaryPoints(
                        controller.adapter.api,
                        value,
                      );
                    setCircle(value);
                    setA(points[0] ?? "");
                    setB(points[1] ?? "");
                  }}
                >
                  <option value="" disabled>
                    Chọn đường tròn
                  </option>
                  {circles.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.displayName ?? o.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="coordinate-fields">
                {(["Đầu cung A", "Đầu cung B"] as const).map((label, index) => (
                  <label className="field" key={label}>
                    {label}
                    <select
                      aria-label={label}
                      value={index ? b : a}
                      onChange={(e) =>
                        index ? setB(e.target.value) : setA(e.target.value)
                      }
                    >
                      <option value="" disabled>
                        Chọn điểm
                      </option>
                      {candidates.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {candidates.length < 2 && (
                <p className="region-help">
                  Cần hai điểm trên đường tròn. Dùng công cụ Điểm trên đối tượng
                  để tạo hai đầu cung trước.
                </p>
              )}
              <label className="field">
                Phần cung
                <select
                  aria-label="Phần cung"
                  value={part}
                  onChange={(e) => setPart(e.target.value as typeof part)}
                >
                  <option value="minor">Cung nhỏ</option>
                  <option value="major">Cung lớn</option>
                </select>
              </label>
            </>
          )}
          <label className="field region-color">
            Màu vùng
            <input
              type="color"
              aria-label="Màu vùng tô"
              value={color}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
            />
          </label>
          <label className="field">
            Độ đậm màu · {opacity}%
            <input
              type="range"
              min="0"
              max="100"
              aria-label="Độ đậm màu vùng tô"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button type="button" onClick={onClose}>
              Hủy
            </button>
            <button
              className="primary"
              type="submit"
              disabled={
                kind === "existing" ? !target : !circle || !a || !b || a === b
              }
            >
              Tô màu
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
