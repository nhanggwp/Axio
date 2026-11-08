import type { GeometryObject } from "../../shared/actions";
import { supportsStroke } from "../geometry/GeometryState";

/** Reflect native properties, including mixed values and imported widths. */
export function StrokeWidthSelect({ objects, label, onChange }: {
  objects: GeometryObject[];
  label: string;
  onChange: (width: number) => void;
}) {
  const supported = objects.filter((o) => supportsStroke(o.type));
  const widths = new Set(supported.map((o) => o.thickness));
  const width = widths.size === 1 ? supported[0]?.thickness : undefined;
  const value = width !== undefined && Number.isInteger(width) && width >= 1 && width <= 13 ? width : "";
  return <select aria-label={label} disabled={!supported.length} value={value} onChange={(e) => onChange(Number(e.target.value))}>
    <option value="" disabled>{!supported.length ? "Không áp dụng" : widths.size > 1 ? "Nhiều giá trị" : "Chưa xác định"}</option>
    {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
  </select>;
}
