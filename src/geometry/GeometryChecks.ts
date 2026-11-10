import { geometryNames } from "../../shared/geometryNames";
import { geometryCheckSchema, type GeometryCheck } from "../../shared/actions";
import type { GeoGebraAdapter } from "./GeoGebraAdapter";

/** Numeric checks read engine results; they never interpret the user's prose. */
export function validateGeometry(adapter: GeoGebraAdapter, checks: GeometryCheck[]) {
  const api = adapter.api;
  const need = (name: string, types?: string[]) => {
    if (!api.exists(name) || !api.isDefined(name)) throw new Error(`Không tìm thấy đối tượng xác định ${name}.`);
    if (types && !types.includes(api.getObjectType(name))) throw new Error(`Đối tượng ${name} không phù hợp để kiểm tra ràng buộc.`);
  };
  const point = (name: string) => {
    need(name, ["point"]);
    const p = { x: api.getXcoord(name), y: api.getYcoord(name) };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`Tọa độ ${name} không hữu hạn.`);
    return p;
  };
  const distance = (a: ReturnType<typeof point>, b: ReturnType<typeof point>) => Math.hypot(a.x - b.x, a.y - b.y);
  const line = (name: string) => {
    need(name, ["line", "segment", "ray"]);
    const coords = new DOMParser().parseFromString(api.getXML(name), "application/xml").querySelector("element > coords");
    const a = Number(coords?.getAttribute("x")), b = Number(coords?.getAttribute("y")), c = Number(coords?.getAttribute("z"));
    if (!coords || ![a, b, c].every(Number.isFinite) || Math.hypot(a, b) < 1e-12) throw new Error(`Không đọc được phương trình đường ${name}.`);
    return { a, b, c };
  };
  const failures: string[] = [];
  for (const input of checks) {
    const check = geometryCheckSchema.parse(input);
    try {
      if (check.kind === "on_segment") {
        const [p, a, b] = check.refs.map(point), length = distance(a, b);
        const residual = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length;
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length);
        if (length < 1e-10 || !Number.isFinite(residual) || residual > 1e-7 * Math.max(1, length) || t < -1e-7 || t > 1 + 1e-7)
          failures.push(`${check.refs[0]} không nằm trên đoạn ${check.refs[1]}${check.refs[2]}.`);
      }
      if (check.kind === "equal_distance") {
        const [a, b, c, d] = check.refs.map(point), first = distance(a, b), second = distance(c, d);
        if (Math.abs(first - second) > 1e-7 * Math.max(1, first, second)) failures.push(`${check.refs[0]}${check.refs[1]} = ${first.toPrecision(8)}, ${check.refs[2]}${check.refs[3]} = ${second.toPrecision(8)}; hai độ dài chưa bằng nhau.`);
      }
      if (check.kind === "reflection") {
        const image = point(check.refs[0]), original = point(check.refs[1]), { a, b, c } = line(check.refs[2]);
        const t = (a * original.x + b * original.y + c) / (a * a + b * b);
        if (distance(image, { x: original.x - 2 * a * t, y: original.y - 2 * b * t }) > 1e-7 * Math.max(1, distance(image, original))) failures.push(`${check.refs[0]} chưa là ảnh đối xứng của ${check.refs[1]} qua ${check.refs[2]}.`);
      }
      if (check.kind === "on_circle") {
        const p = point(check.refs[0]); need(check.refs[1], ["circle"]);
        const matrix = new DOMParser().parseFromString(api.getXML(check.refs[1]), "application/xml").querySelector("element > matrix");
        if (!matrix) throw new Error(`Không đọc được đường tròn ${check.refs[1]}.`);
        const a = Number(matrix.getAttribute("A0")), x = -Number(matrix.getAttribute("A4")) / a, y = -Number(matrix.getAttribute("A5")) / a;
        const r2 = x * x + y * y - Number(matrix.getAttribute("A2")) / a, d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (![x, y, r2, d2].every(Number.isFinite) || Math.abs(d2 - r2) > 1e-7 * Math.max(1, r2, d2)) failures.push(`${check.refs[0]} không nằm trên đường tròn ${check.refs[1]}.`);
      }
      if (check.kind === "perpendicular") {
        const [a, b] = check.refs.map(line);
        if (Math.abs(a.a * b.a + a.b * b.b) / (Math.hypot(a.a, a.b) * Math.hypot(b.a, b.b)) > 1e-7) failures.push(`${check.refs[0]} chưa vuông góc với ${check.refs[1]}.`);
      }
      if (check.kind === "coordinate_order") {
        const [a, b] = check.refs.map(point);
        if (b[check.axis] - a[check.axis] <= 1e-8) failures.push(`${check.refs[0]} phải ${check.axis === "x" ? "ở bên trái" : "ở bên dưới"} ${check.refs[1]}; thực tế ${check.axis}: ${a[check.axis]}, ${b[check.axis]}. Hãy sửa vị trí hoặc nhánh giao điểm.`);
      }
      if (check.kind === "distance") {
        const [a, b] = check.refs.map(point), actual = distance(a, b);
        if (Math.abs(actual - check.value) > 1e-7 * Math.max(1, actual, check.value)) failures.push(`${check.refs.join("")} = ${actual.toPrecision(8)}, phải bằng ${check.value}.`);
      }
      if (check.kind === "moveable") for (const name of check.refs) {
        need(name, ["point"]);
        if (!api.isMoveable(name) || !api.getVisible(name)) failures.push(`${name} không kéo được. Cần điểm tự do hoặc point_on hiển thị trên quỹ tích để làm điểm điều khiển.`);
      }
      if (check.kind === "dependent") for (const name of check.refs) {
        need(name);
        if (api.isIndependent(name)) failures.push(`${name} đang là đối tượng tự do, chưa phụ thuộc vào phép dựng.`);
      }
    } catch (error) { failures.push(error instanceof Error ? error.message : "Không thể kiểm tra ràng buộc."); }
  }
  if (failures.length) throw new Error(`Hình chưa thỏa ràng buộc:\n${failures.join("\n")}`);
}

/** A bounded numerical probe, not a proof. Runs only in the disposable preview. */
export function validateDynamicGeometry(adapter: GeoGebraAdapter, checks: GeometryCheck[]) {
  if (!checks.length) return;
  const api = adapter.api, roots = new Set<string>(), visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name) || !api.exists(name)) return;
    visited.add(name);
    if (api.getObjectType(name) === "point" && api.isMoveable(name) && (api.isIndependent(name) || api.getVisible(name))) roots.add(name);
    if (api.getObjectType(name) === "point" && api.isIndependent(name)) return;
    for (const input of geometryNames(api.getCommandString(name, false))) if (input !== name) visit(input);
  };
  for (const check of checks) check.refs.forEach(visit);
  const snapshot = adapter.snapshot();
  for (const name of [...roots].slice(0, 6)) {
    try {
      const x = api.getXcoord(name), y = api.getYcoord(name);
      const step = 0.001 * Math.max(1, Math.abs(x), Math.abs(y));
      api.setCoords(name, x + step, y + 1.7 * step);
      validateGeometry(adapter, checks);
    } catch (error) {
      throw new Error(`Ràng buộc mất khi thử di chuyển ${name}. Các điểm cần phụ thuộc phép dựng thay vì chỉ đúng tại tọa độ ban đầu.\n${error instanceof Error ? error.message : String(error)}`);
    } finally { adapter.restore(snapshot); }
  }
}
