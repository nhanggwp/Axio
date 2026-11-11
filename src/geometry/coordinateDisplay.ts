import type { GGBApi } from "../types/geogebra";
export function hasCoordinateAxes(api: GGBApi) {
  const raw = api.getGraphicsOptions(1),
    options = typeof raw === "string" ? JSON.parse(raw) : raw;
  return !!(options.axes.x.visible || options.axes.y.visible);
}
export function formatPointCoordinates(api: GGBApi) {
  const active = hasCoordinateAxes(api);
  const raw = api.getGraphicsOptions(1),
    options = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (active && (!options.axes.x.label || !options.axes.y.label)) {
    const legacyGrid =
      options.gridDistance.x === 0.27 && options.gridDistance.y === 0.27;
    api.setGraphicsOptions(1, {
      axes: {
        x: { label: options.axes.x.label || "x", showNumbers: true },
        y: { label: options.axes.y.label || "y", showNumbers: true },
      },
      ...(legacyGrid ? { gridDistance: {} } : {}),
    });
  }
  const mode = active ? 1 : 0;
  for (const name of api.getAllObjectNames("point")) {
    const previous = api.getLabelStyle(name);
    if ((previous === 0 || previous === 1) && previous !== mode)
      api.setLabelStyle(name, mode);
  }
}
export function configureCoordinateAxes(api: GGBApi, visible: boolean) {
  api.setGraphicsOptions(1, {
    axesColor: "#23232D",
    axes: {
      x: {
        visible,
        label: "x",
        showNumbers: true,
        positiveAxis: false,
        tickStyle: 1,
      },
      y: {
        visible,
        label: "y",
        showNumbers: true,
        positiveAxis: false,
        tickStyle: 1,
      },
    },
    // Let native grid/tick spacing adapt together when zooming.
    gridDistance: visible ? {} : { x: 0.27, y: 0.27 },
  });
  formatPointCoordinates(api);
}
