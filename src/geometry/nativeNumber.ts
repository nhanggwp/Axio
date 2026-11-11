/** GeoGebra treats lowercase e as Euler's constant, not a JS exponent marker. */
export function nativeNumber(value: number): string {
  if (!Number.isFinite(value))
    throw new Error("Giá trị hình học phải hữu hạn.");
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [mantissa, power] = text.toLowerCase().split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const unsigned = mantissa.replace("-", "");
  const digits = unsigned.replace(".", "");
  const decimal =
    (unsigned.indexOf(".") < 0 ? unsigned.length : unsigned.indexOf(".")) +
    Number(power);
  if (decimal <= 0) return sign + "0." + "0".repeat(-decimal) + digits;
  if (decimal >= digits.length)
    return sign + digits + "0".repeat(decimal - digits.length);
  return sign + digits.slice(0, decimal) + "." + digits.slice(decimal);
}
