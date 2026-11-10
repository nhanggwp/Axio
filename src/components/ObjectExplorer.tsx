import { useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { isDuplicateBoundarySegment } from "../geometry/segmentLabels";
import { POLYGON_TYPES } from "../geometry/triangleVertices";
import type { GeometryObject } from "../../shared/actions";
import { IconButton } from "./Icon";
const categories = [
  ["ĐIỂM", ["point"]],
  ["ĐƯỜNG & ĐOẠN THẲNG", ["line", "segment", "ray", "vector"]],
  ["ĐA GIÁC", POLYGON_TYPES],
  ["ĐƯỜNG TRÒN", ["circle", "conic", "conicpart"]],
  ["SỐ ĐO", ["numeric", "angle", "text"]],
] as const;
export function ObjectExplorer({
  controller,
  onClose,
  onSelect,
}: {
  controller?: GeometryController;
  onClose: () => void;
  onSelect: (name: string, additive?: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const knownTypes = new Set<string>(categories.flatMap(([, types]) => [...types]));
  const otherTypes = [...new Set(controller?.objects.filter((o) => !knownTypes.has(o.type)).map((o) => o.type))];
  const groups = [...categories, ...(otherTypes.length ? [["KHÁC", otherTypes] as const] : [])];
  return (
    <aside className="explorer">
      <header>
        <strong>Đối tượng</strong>
        <IconButton
          icon="panel"
          label="Thu gọn danh sách đối tượng"
          onClick={onClose}
        />
      </header>
      <input
        aria-label="Tìm đối tượng"
        placeholder="Tìm đối tượng…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="object-list">
        {groups.map(([title, types]) => (
          <details open key={title}>
            <summary>{title}</summary>
            {controller?.objects
              .filter(
                (o) =>
                  (types as readonly string[]).includes(o.type) &&
                  !isDuplicateBoundarySegment(o, controller.objects) &&
                  [o.name, o.displayName].some((name) => name?.toLowerCase().includes(search.toLowerCase())),
              )
              .map((o) => (
                <div className="object-row" key={o.name}>
                  <button
                    className={`object-value ${controller.selectedNames.includes(o.name) ? "selected" : ""}`}
                    onClick={(e) =>
                      onSelect(o.name, e.shiftKey || e.ctrlKey || e.metaKey)
                    }
                  >
                    <b>{o.displayName ?? o.name}</b>
                    <span title={o.value}>{formatObject(o)}</span>
                  </button>
                  <IconButton
                    icon="eye"
                    label={`${o.visible ? "Ẩn" : "Hiện"} ${o.displayName ?? o.name}`}
                    className={o.visible ? "" : "invisible-object"}
                    onClick={() =>
                      controller.apply([
                        { type: "style", target: o.name, visible: !o.visible },
                      ])
                    }
                  />
                </div>
              ))}
          </details>
        ))}
        {controller?.objects.length === 0 && (
          <p className="empty-text">Chọn công cụ Điểm để bắt đầu dựng hình.</p>
        )}
      </div>
    </aside>
  );
}
export function formatObject(o: GeometryObject) {
  if (o.type === "point")
    return `(${Number(o.x?.toFixed(2))}, ${Number(o.y?.toFixed(2))})`;
  return o.value.replace(new RegExp("^" + o.name + "\\s*[=:]\\s*"), "");
}
