import { useEffect, useRef, useState } from "react";
import type { GeometryController } from "./GeometryController";

export function useViewport(controller?: GeometryController) {
  const [state, setState] = useState<{ grid: boolean; axes: boolean; snap: boolean; zoom: number } | null>(null);
  const baseline = useRef(0);
  const refresh = () => {
    if (!controller) return;
    const view = controller.adapter.viewState();
    if (!baseline.current) baseline.current = view.invXscale;
    const next = { grid: view.grid, axes: view.axes, snap: view.snap, zoom: Math.round(100 * baseline.current / view.invXscale) };
    setState((old) => old && old.grid === next.grid && old.axes === next.axes && old.snap === next.snap && old.zoom === next.zoom ? old : next);
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!controller) return;
    baseline.current = 0;
    let document = controller.documentGeneration;
    const sync = () => {
      if (document !== controller.documentGeneration) {
        document = controller.documentGeneration;
        baseline.current = 0;
      }
      refreshRef.current();
    };
    sync();
    return controller.subscribe(sync);
  }, [controller]);
  return { ...state, fit: () => {
    if (!controller) return;
    baseline.current = 0;
    controller.adapter.resetView();
    refresh();
  } };
}
