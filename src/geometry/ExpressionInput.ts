import { nativeNumber } from "./nativeNumber";
import { labelSchema } from "../../shared/actions";
import type { GGBApi } from "../types/geogebra";

type Node =
  | { kind: "number"; text: string }
  | { kind: "name"; name: string }
  | { kind: "unary"; op: string; value: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "point"; x: Node; y: Node };
type Token = { text: string; kind: "number" | "name" | "symbol" };
const functions: Record<string, number> = {
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  sqrt: 1,
  abs: 1,
  exp: 1,
  ln: 1,
  log: 1,
  floor: 1,
  ceil: 1,
};
const normalize = (s: string) =>
  s
    .replace(/−|–/g, "-")
    .replace(/×|·/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/ℯ/g, "e")
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g,
      (s) =>
        "^(" +
        [...s].map((c) => "0123456789-"["⁰¹²³⁴⁵⁶⁷⁸⁹⁻".indexOf(c)]).join("") +
        ")",
    );
function tokenize(input: string): Token[] {
  if (!input.trim() || input.length > 512 || /[\r\n]/.test(input))
    throw new Error("Nhập một công thức, tối đa 512 ký tự.");
  const s = normalize(input),
    tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    const rest = s.slice(i),
      number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/),
      name = rest.match(/^[A-Za-z][A-Za-z0-9_]*'{0,3}/);
    if (number) {
      if (!Number.isFinite(Number(number[0])))
        throw new Error("Giá trị số phải hữu hạn.");
      tokens.push({ text: number[0], kind: "number" });
      i += number[0].length;
    } else if (name) {
      tokens.push({ text: name[0], kind: "name" });
      i += name[0].length;
    } else if ("+-*/^()=,:".includes(s[i]))
      tokens.push({ text: s[i++], kind: "symbol" });
    else
      throw new Error(
        "Cú pháp chưa được hỗ trợ. Dùng số, biến, phép toán và hàm toán học; không nhập lệnh hoặc script.",
      );
    if (tokens.length > 160)
      throw new Error(
        "Công thức quá dài. Hãy chia thành các công thức nhỏ hơn.",
      );
  }
  return tokens;
}
class Parser {
  index = 0;
  depth = 0;
  constructor(readonly tokens: Token[]) {}
  peek(text?: string) {
    const t = this.tokens[this.index];
    return text === undefined ? t?.text : t?.text === text;
  }
  take(text?: string) {
    const t = this.tokens[this.index];
    if (!t || (text !== undefined && t.text !== text))
      throw new Error(
        text
          ? `Thiếu “${text}” trong công thức.`
          : "Công thức chưa hoàn chỉnh.",
      );
    this.index++;
    return t;
  }
  expression(min = 0): Node {
    if (++this.depth > 24)
      throw new Error("Công thức lồng quá nhiều dấu ngoặc.");
    let left: Node;
    const t = this.take();
    if (t.text === "+" || t.text === "-")
      left = { kind: "unary", op: t.text, value: this.expression(25) };
    else if (t.kind === "number") left = { kind: "number", text: t.text };
    else if (t.kind === "name") {
      if (this.peek("(")) {
        this.take("(");
        const args = [this.expression()];
        while (this.peek(",")) {
          this.take(",");
          args.push(this.expression());
        }
        this.take(")");
        left = { kind: "call", name: t.text, args };
      } else left = { kind: "name", name: t.text };
    } else if (t.text === "(") {
      left = this.expression();
      if (this.peek(",")) {
        this.take(",");
        left = { kind: "point", x: left, y: this.expression() };
      }
      this.take(")");
    } else throw new Error("Công thức chưa hoàn chỉnh.");
    while (this.index < this.tokens.length) {
      const t = this.tokens[this.index],
        explicit = ["+", "-", "*", "/", "^"].includes(t.text),
        implicit = t.kind === "number" || t.kind === "name" || t.text === "(";
      const op = explicit ? t.text : implicit ? "*" : null;
      if (!op) break;
      const precedence = op === "^" ? 30 : op === "*" || op === "/" ? 20 : 10;
      if (precedence < min) break;
      if (explicit) this.index++;
      const right = this.expression(op === "^" ? precedence : precedence + 1);
      left = { kind: "binary", op, left, right };
    }
    this.depth--;
    return left;
  }
}
const print = (n: Node): string =>
  n.kind === "number"
    ? nativeNumber(Number(n.text))
    : n.kind === "name"
      ? n.name === "e"
        ? "exp(1)"
        : n.name
      : n.kind === "unary"
        ? `(${n.op}${print(n.value)})`
        : n.kind === "binary"
          ? `(${print(n.left)}${n.op}${print(n.right)})`
          : n.kind === "point"
            ? `(${print(n.x)},${print(n.y)})`
            : `${n.name}(${n.args.map(print).join(",")})`;
function validate(
  n: Node,
  api: Pick<GGBApi, "exists" | "getObjectType">,
): void {
  if (n.kind === "name") {
    if (
      !["x", "y", "pi", "e"].includes(n.name) &&
      (!api.exists(n.name) || api.getObjectType(n.name) !== "numeric")
    )
      throw new Error(
        `Chưa có tham số ${n.name}. Hãy nhập ${n.name}=2 hoặc một giá trị khác trước.`,
      );
  } else if (n.kind === "call") {
    const count =
      functions[n.name] ??
      (api.exists(n.name) && api.getObjectType(n.name) === "function" ? 1 : 0);
    if (!count || n.args.length !== count)
      throw new Error(`Hàm ${n.name} chưa được hỗ trợ hoặc sai số đối số.`);
    n.args.forEach((a) => validate(a, api));
  } else if (n.kind === "binary") {
    validate(n.left, api);
    validate(n.right, api);
  } else if (n.kind === "unary") validate(n.value, api);
  else if (n.kind === "point") {
    validate(n.x, api);
    validate(n.y, api);
  }
}
export function compileExpression(
  input: string,
  api: Pick<GGBApi, "exists" | "getObjectType">,
) {
  const tokens = tokenize(input),
    p = new Parser(tokens);
  let label: string | undefined,
    signature = false;
  if (tokens[0]?.kind === "name" && tokens[1]?.text === ":") {
    label = p.take().text;
    p.take(":");
  } else if (
    tokens[0]?.kind === "name" &&
    tokens[1]?.text === "(" &&
    tokens[2]?.text === "x" &&
    tokens[3]?.text === ")" &&
    tokens[4]?.text === "="
  ) {
    label = p.take().text;
    p.take("(");
    p.take("x");
    p.take(")");
    p.take("=");
    signature = true;
  } else if (
    tokens[0]?.kind === "name" &&
    tokens[1]?.text === "=" &&
    !["x", "y"].includes(tokens[0].text)
  ) {
    label = p.take().text;
    p.take("=");
  }
  if (
    label &&
    (!labelSchema.safeParse(label).success ||
      ["x", "y", "pi", "e", ...Object.keys(functions)].includes(label))
  )
    throw new Error(
      "Tên này được dành cho tọa độ hoặc hàm toán học. Hãy chọn tên khác.",
    );
  const left = p.expression();
  let right: Node | undefined;
  if (p.peek("=")) {
    p.take("=");
    right = p.expression();
  }
  if (p.index !== tokens.length)
    throw new Error("Chỉ nhập một phương trình hoặc một định nghĩa mỗi lần.");
  validate(left, api);
  if (right) validate(right, api);
  if (signature && (left.kind === "point" || right))
    throw new Error("Định nghĩa hàm theo dạng f(x)=x^2.");
  const command = right
    ? `${label ? label + ": " : ""}${print(left)}=${print(right)}`
    : `${label ? label + (signature ? "(x)" : "") + "=" : ""}${print(left)}`;
  return { command, label };
}
export function canEditExpression(api: GGBApi, name: string) {
  return (
    [
      "point",
      "numeric",
      "function",
      "line",
      "circle",
      "ellipse",
      "hyperbola",
      "parabola",
      "implicitpoly",
      "implicitcurve",
    ].includes(api.getObjectType(name)) &&
    !/^[A-Z][A-Za-z]+[\[(]/.test(api.getCommandString(name, false))
  );
}
