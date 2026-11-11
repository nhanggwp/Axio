/** Trim the rendered vector content, including labels and stroke widths. */
export type ImageBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
const SVG_NS = "http://www.w3.org/2000/svg";
export function exportDocument(source: string) {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = doc.documentElement;
  const width = Number.parseFloat(svg.getAttribute("width") || "");
  const height = Number.parseFloat(svg.getAttribute("height") || "");
  if (
    svg.localName !== "svg" ||
    doc.querySelector("parsererror") ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Không thể đọc kích thước ảnh xuất.");
  return { doc, svg, width, height };
}
export function whiteSVG(source: string, bounds?: ImageBounds) {
  const { doc, svg, width, height } = exportDocument(source);
  const box = bounds ?? { x: 0, y: 0, width, height };
  svg.setAttribute("width", String(box.width));
  svg.setAttribute("height", String(box.height));
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  const background = doc.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", String(box.x));
  background.setAttribute("y", String(box.y));
  background.setAttribute("width", String(box.width));
  background.setAttribute("height", String(box.height));
  background.setAttribute("fill", "#FFFFFF");
  svg.insertBefore(background, svg.firstChild);
  return new XMLSerializer().serializeToString(svg);
}
export async function svgCanvas(source: string, scale = 1) {
  const { width, height } = exportDocument(source);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không thể tạo ảnh.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function contentBounds(
  source: string,
  padding = 24,
): Promise<ImageBounds | undefined> {
  const canvas = await svgCanvas(whiteSVG(source));
  const context = canvas.getContext("2d")!;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width,
    top = canvas.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) >= 250) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return undefined;
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + 1 + padding * 2,
    height: bottom - top + 1 + padding * 2,
  };
}
