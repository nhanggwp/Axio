import { solidMember } from "../geometry/SolidProjection";
import { solidNames } from "../../shared/solids";
import { circularRegionInfo } from "../geometry/RegionFill";
import { isMeasurementObject, measurementVisible, setMeasurementVisible } from "../geometry/segmentLabels";
import { geometryNames } from "../../shared/geometryNames";
import { supportsFill, supportsStroke } from "../geometry/GeometryState";
import { useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { labelSchema } from "../../shared/actions";
import { IconButton } from "./Icon";
import { StrokeWidthSelect } from "./StrokeWidthSelect";

const OBJECT_TYPE_LABELS: Record<string, string> = {
  point: "Điểm",
  segment: "Đoạn thẳng",
  line: "Đường thẳng",
  ray: "Tia",
  vector: "Vectơ",
  triangle: "Tam giác",
  quadrilateral: "Tứ giác",
  pentagon: "Ngũ giác",
  hexagon: "Lục giác",
  heptagon: "Thất giác",
  octagon: "Bát giác",
  nonagon: "Cửu giác",
  decagon: "Thập giác",
  polygon: "Đa giác",
  circle: "Đường tròn",
  conic: "Đường conic",
  conicpart: "Cung conic",
  arc: "Cung / hình viên phân",
  sector: "Hình quạt tròn",
  angle: "Góc",
  numeric: "Số đo",
  text: "Văn bản",
};

const SWATCH_COLORS = [
  "#23232D",
  "#4F18E9",
  "#09EFF8",
  "#E31665",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
] as const;

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
  const owner = solidMember(controller.adapter.api, o.name);
  const automaticEdge = owner?.edges.includes(o.name) ?? false, solidFace = owner?.faces.includes(o.name) ?? false;
  const region = circularRegionInfo(controller.adapter.api, o.name);
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
      geometryNames(d.definition).includes(o.name),
    )
    .map((d) => d.name);
  const typeLabel = o.solid ? solidNames[o.solid.kind] : region ? (region.kind === "circular_segment" ? "Hình viên phân" : "Hình quạt tròn") : OBJECT_TYPE_LABELS[o.type] ?? "Đối tượng";
  return (
    <aside className="inspector">
      <header>
        <span className="eyebrow purple">THUỘC TÍNH</span>
        <IconButton icon="close" label="Đóng thuộc tính" onClick={onClose} />
      </header>
      <h2>
        {typeLabel} {o.solid ? o.name : o.displayName ?? o.name}
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
                  "Tên bắt đầu bằng chữ cái, gồm chữ cái, chữ số, dấu gạch dưới và tối đa ba dấu phẩy trên ở cuối; tối đa 24 ký tự.",
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
      {controller.canUnlink([o.name]) && (
        <button
          type="button"
          onClick={() => {
            try {
              controller.unlinkObjects([o.name]);
            } catch (e) {
              onError(e);
            }
          }}
        >
          Xóa liên kết
        </button>
      )}
      {o.solid && <div className="solid-properties">
        <p>{o.solid.faces.length} mặt · {o.solid.vertices.length} đỉnh · {o.solid.edges.length} cạnh</p>
        <small>Hình biểu diễn trên mặt phẳng. Bật chế độ không gian để cạnh khuất hiện nét đứt; độ dài xiên trên màn hình không phải độ dài thật.</small>
        <p>Kích thước thật: {o.solid.dimensions.width} × {o.solid.dimensions.depth} × {o.solid.dimensions.height}</p>
        <p className="eyebrow">CHỌN MẶT ĐỂ TÔ MÀU</p>
        <div className="solid-face-list">{o.solid.faces.map(face => <button key={face} onClick={() => controller.select(face)}>Mặt {controller.objects.find(object => object.name === face)?.displayName ?? face}</button>)}</div>
      </div>}
      <p className="eyebrow">QUAN HỆ PHỤ THUỘC</p>
      <p className="definition">
        {o.solid ? `Các đáy và cạnh bên có liên kết. Điểm điều khiển: ${controls.join(", ")}.` : region ? `${region.kind === "circular_segment" ? "Giới hạn bởi cung và dây" : "Giới hạn bởi hai bán kính và cung"} ${region.points.join("")} · cung ${region.part === "minor" ? "nhỏ" : "lớn"} của đường tròn ${region.circle}.` : o.definition || "Không có đối tượng gốc"}
        {dependents.length > 0 && (
          <>
            <br />
            Phụ thuộc vào đối tượng này: {dependents.join(" · ")}
          </>
        )}
      </p>
      <p className="eyebrow">HIỂN THỊ</p>
      <div className="color-picker">
        <span>{supportsFill(o.type) ? "Màu hình / vùng" : "Nét vẽ"}</span>
        {SWATCH_COLORS.map((c) => (
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
        <input
          type="color"
          aria-label="Màu tùy chỉnh"
          value={/^#[0-9A-Fa-f]{6}$/.test(o.color) ? o.color : "#23232D"}
          onChange={(e) =>
            controller.apply([{ type: "style", target: o.name, color: e.target.value.toUpperCase() }])
          }
        />
      </div>
      {supportsFill(o.type) && <label className="field region-opacity">Độ đậm màu vùng · {Math.round((o.opacity ?? 0) * 100)}%<input type="range" min="0" max="100" aria-label="Độ đậm màu vùng" value={Math.round((o.opacity ?? 0) * 100)} onChange={e => controller.apply([{ type: "style", target: o.name, opacity: Number(e.target.value) / 100 }])} /><small>0%: không tô · 100%: màu đặc. Dùng bảng màu bên trên để đổi màu vùng.</small></label>}
      <div className="coordinate-fields">
        <label className="field">
          Độ dày
          <StrokeWidthSelect
            label="Độ dày"
            objects={o.solid ? [{ ...o, type: "segment" }] : solidFace ? [{ ...o, type: "solid_face" }] : [o]}
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
            disabled={!supportsStroke(o.type) || automaticEdge || solidFace}
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
      {automaticEdge && <small>Kiểu nét cạnh khuất được tự tính theo chế độ không gian.</small>}
      {solidFace && <small>Màu và độ đậm áp dụng cho mặt. Chọn cạnh để thay đổi nét vẽ.</small>}
      {isMeasurementObject(controller.adapter.api,o.name) && <label className="check"><input type="checkbox" checked={measurementVisible(controller.adapter.api,o.name)} onChange={e => change(() => setMeasurementVisible(controller.adapter.api,o.name,e.target.checked))}/>Hiện số đo</label>}
      <label className="check">
        <input
          type="checkbox"
          key={o.name}
          checked={o.labelVisible ?? false}
          onChange={(e) => o.solid ? controller.apply([{ type: "style", target: o.name, label: e.target.checked ? "name" : "hidden" }]) : change(() => controller.adapter.api.setLabelVisible(o.name, e.target.checked))}
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
            checked={/<fixed\b[^>]*val="true"/.test(controller.adapter.api.getXML(o.name))}
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
