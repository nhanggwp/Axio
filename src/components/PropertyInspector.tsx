import { supportsStroke } from "../geometry/GeometryState";
import { useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { labelSchema } from "../../shared/actions";
import { IconButton } from "./Icon";
import { StrokeWidthSelect } from "./StrokeWidthSelect";
export function PropertyInspector({
  controller,
  onClose,
  onError,
  onDelete,
}: {
  controller: GeometryController;
  onClose: () => void;
  onError: (e: unknown) => void;
  onDelete: () => void;
}) {
  const o = controller.objects.find((o) => o.name === controller.selection);
  const [rename, setRename] = useState("");
  if (!o) return null;
  const controls = !o.moveable ? controller.controlPoints(o.name) : [];
  const change = (fn: () => void) => {
    try {
      controller.mutate(fn);
    } catch (e) {
      onError(e);
    }
  };
  const dependents = controller.objects
    .filter((d) =>
      d.definition.match(/[A-Za-z][A-Za-z0-9_]*/g)?.includes(o.name),
    )
    .map((d) => d.name);
  return (
    <aside className="inspector">
      <header>
        <span className="eyebrow purple">THUỘC TÍNH</span>
        <IconButton icon="close" label="Đóng thuộc tính" onClick={onClose} />
      </header>
      <h2>
        {o.type === "point" ? "Điểm" : "Đối tượng"} {o.displayName ?? o.name}
      </h2>
      <label className="field">
        Tên
        <input
          aria-label="Tên đối tượng"
          key={o.name}
          defaultValue={o.name}
          onChange={(e) => setRename(e.target.value)}
          onBlur={() => {
            if (!rename || rename === o.name) return;
            change(() => {
              if (!labelSchema.safeParse(rename).success)
                throw new Error(
                  "Tên bắt đầu bằng chữ cái, chỉ gồm chữ cái, chữ số và dấu gạch dưới; tối đa 24 ký tự.",
                );
              if (
                controller.adapter.api.exists(rename) ||
                !controller.adapter.api.renameObject(o.name, rename)
              )
                throw new Error("Tên đã tồn tại hoặc không hợp lệ.");
              controller.selection = rename;
              setRename("");
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      {o.type === "point" && (
        <div className="coordinate-fields">
          {(["x", "y"] as const).map((axis) => (
            <label className="field" key={axis}>
              {axis.toUpperCase()}
              <input
                aria-label={`Tọa độ ${axis}`}
                type="number"
                step="any"
                key={`${o.name}-${o[axis]}`}
                defaultValue={o[axis] ?? 0}
                disabled={!o.moveable}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val) || Math.abs(val) > 100000) {
                    onError(new Error("Tọa độ không hợp lệ."));
                    return;
                  }
                  try {
                    controller.apply([
                      {
                        type: "move",
                        target: o.name,
                        x: axis === "x" ? val : o.x!,
                        y: axis === "y" ? val : o.y!,
                      },
                    ]);
                  } catch (err) {
                    onError(err);
                  }
                }}
              />
            </label>
          ))}
        </div>
      )}
      <small>
        {o.independent
          ? "Đối tượng tự do"
          : o.moveable
            ? "Đối tượng bị ràng buộc · kéo trên quỹ tích"
            : "Đối tượng phụ thuộc · thay đổi qua đối tượng gốc"}
        {controls.length > 0 && ` · Kéo ${controls.join(" hoặc ")} để chỉnh hình.`}
      </small>
      <p className="eyebrow">QUAN HỆ PHỤ THUỘC</p>
      <p className="definition">
        {o.definition || "Không có đối tượng gốc"}
        {dependents.length > 0 && (
          <>
            <br />
            Phụ thuộc vào đối tượng này: {dependents.join(" · ")}
          </>
        )}
      </p>
      <p className="eyebrow">HIỂN THỊ</p>
      <div className="color-picker">
        <span>Nét vẽ</span>
        {["#23232D", "#4F18E9", "#09EFF8", "#E31665"].map((c) => (
          <button
            key={c}
            style={{ background: c }}
            className={o.color.toUpperCase() === c ? "color-selected" : ""}
            aria-label={`Màu ${c}`}
            onClick={() =>
              controller.apply([{ type: "style", target: o.name, color: c }])
            }
          />
        ))}
      </div>
      <div className="coordinate-fields">
        <label className="field">
          Độ dày
          <StrokeWidthSelect
            label="Độ dày"
            objects={[o]}
            onChange={(width) =>
              controller.apply([
                {
                  type: "style",
                  target: o.name,
                  thickness: width,
                },
              ])
            }
          />
        </label>
        <label className="field">
          Kiểu nét
          <select
            value={o.lineStyle ?? 0}
            aria-label="Kiểu nét"
            disabled={!supportsStroke(o.type)}
            onChange={(e) =>
              change(() =>
                controller.adapter.api.setLineStyle(
                  o.name,
                  Number(e.target.value),
                ),
              )
            }
          >
            <option value="0">Nét liền</option>
            <option value="1">Nét đứt dài</option>
            <option value="2">Nét đứt ngắn</option>
            <option value="3">Nét chấm</option>
            <option value="4">Nét gạch chấm</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          key={o.name}
          checked={o.labelVisible ?? false}
          onChange={(e) =>
            change(() =>
              controller.adapter.api.setLabelVisible(o.name, e.target.checked),
            )
          }
        />
        Hiện nhãn
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.visible}
          onChange={(e) =>
            controller.apply([
              { type: "style", target: o.name, visible: e.target.checked },
            ])
          }
        />
        Hiện đối tượng
      </label>
      {o.independent && (
        <label className="check">
          <input
            type="checkbox"
            checked={!o.moveable}
            onChange={(e) =>
              change(() =>
                controller.adapter.api.setFixed(o.name, e.target.checked, true),
              )
            }
          />
          Khóa vị trí
        </label>
      )}
      <button onClick={onDelete}>Xóa đối tượng</button>
      <small>Xóa cả các đối tượng phụ thuộc. Có thể hoàn tác.</small>
    </aside>
  );
}
