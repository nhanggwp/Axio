import { solidVertexPositions, type SolidKind } from "../../shared/solids";
import type { GeometryController } from "./GeometryController";

export function insertSolidPreset(
  controller: GeometryController,
  kind: SolidKind,
) {
  const api = controller.adapter.api,
    view = JSON.parse(api.getViewProperties(1));
  const dimensions =
    kind === "cube"
      ? { width: 3, depth: 3, height: 3 }
      : { width: 4, depth: 3, height: 3 };
  const projected = solidVertexPositions(kind, dimensions).map((p) => ({
    x: p.x + 0.55 * p.y,
    y: p.z + 0.35 * p.y,
  }));
  const width = Math.max(...projected.map((p) => p.x)),
    height = Math.max(...projected.map((p) => p.y));
  const scale = Math.max(
    0.001,
    Math.min(
      (view.width * view.invXscale * 0.55) / width,
      (view.height * view.invYscale * 0.6) / height,
    ),
  );
  let i = 1;
  while (api.exists(`solid${i}`)) i++;
  const label = `solid${i}`;
  controller.apply([
    {
      type: "solid",
      kind,
      label,
      dimensions,
      origin: {
        x: view.xMin + (view.width * view.invXscale) / 2 - (width * scale) / 2,
        y:
          view.yMin + (view.height * view.invYscale) / 2 - (height * scale) / 2,
      },
      scale,
    },
  ]);
  controller.setMode(0);
  controller.select(label);
  return label;
}
