import { supportsStroke } from "../geometry/GeometryState";
import type { GeometryController } from "../geometry/GeometryController";
import { IconButton } from "./Icon";
import { StrokeWidthSelect } from "./StrokeWidthSelect";
export function BatchInspector({
  controller,
  onClose,
  onDelete,
  onError,
}: {
  controller: GeometryController;
  onClose: () => void;
  onDelete: () => void;
  onError: (e: unknown) => void;
}) {
  const selected = controller.objects.filter((o) =>
    controller.selectedNames.includes(o.name),
  );
  const change = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <aside className="inspector">
      <header>
        <span className="eyebrow purple">THUỘC TÍNH CHUNG</span>
        <IconButton icon="close" label="Đóng thuộc tính" onClick={onClose} />
      </header>
      <h2>{selected.length} đối tượng</h2>
      <p>{selected.map((o) => o.displayName ?? o.name).join(" · ")}</p>
      <div className="color-picker">
        <span>Nét vẽ</span>
        {["#23232D", "#4F18E9", "#09EFF8", "#E31665"].map((color) => (
          <button
            key={color}
            style={{ background: color }}
            aria-label={`Màu chung ${color}`}
            onClick={() =>
              change(() =>
                controller.apply(
                  selected.map((o) => ({
                    type: "style",
                    target: o.name,
                    color,
                  })),
                ),
              )
            }
          />
        ))}
      </div>
      <label className="field">
        Độ dày
        <StrokeWidthSelect
          label="Độ dày chung"
          objects={selected}
          onChange={(width) =>
            change(() =>
              controller.apply(
                selected
                  .filter((o) => supportsStroke(o.type))
                  .map((o) => ({
                    type: "style",
                    target: o.name,
                    thickness: width,
                  })),
              ),
            )
          }
        />
      </label>
      <button
        onClick={() =>
          change(() =>
            controller.apply(
              selected.map((o) => ({
                type: "style",
                target: o.name,
                visible: !selected.every((o) => o.visible),
              })),
            ),
          )
        }
      >
        Ẩn / Hiện các đối tượng
      </button>
      <button onClick={onDelete}>Xóa các đối tượng</button>
      <button onClick={() => controller.select(null)}>Bỏ chọn</button>
      <small>
        Chỉ đổi thuộc tính dùng chung. Quan hệ toán học vẫn do GeoGebra quản lý.
      </small>
    </aside>
  );
}
