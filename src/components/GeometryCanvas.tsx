import { useEffect, useId, useRef, useState } from "react";
import { GeoGebraAdapter, loadGeoGebra } from "../geometry/GeoGebraAdapter";
import type { GGBApi } from "../types/geogebra";
export function GeometryCanvas({
  onReady,
  base64,
}: {
  onReady: (adapter: GeoGebraAdapter) => void;
  base64?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const id = "ggb" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const callback = useRef(onReady);
  callback.current = onReady;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let api: GGBApi | undefined;
    let observer: ResizeObserver | undefined;
    const timeout = setTimeout(() => {
      if (!disposed)
        setError("GeoGebra chưa phản hồi. Kiểm tra kết nối mạng và thử lại.");
    }, 45000);
    loadGeoGebra()
      .then(() => {
        if (disposed || !host.current) return;
        const box = host.current.getBoundingClientRect();
        const applet = new window.GGBApplet(
          {
            id,
            appName: "geometry",
            width: Math.round(box.width),
            height: Math.round(box.height),
            language: "vi",
            showToolBar: false,
            showMenuBar: false,
            showAlgebraInput: false,
            showResetIcon: false,
            showZoomButtons: false,
            showFullscreenButton: false,
            showSuggestionButtons: false,
            allowStyleBar: false,
            enableRightClick: false,
            enableShiftDragZoom: true,
            disableAutoScale: true,
            preloadModules: "discrete,advanced",
            borderColor: "#FFFFFF",
            ...(base64 ? { ggbBase64: base64 } : {}),
            appletOnLoad: async (loaded: GGBApi) => {
              if (disposed) { loaded.remove(); return; }
              api = loaded;
              try {
                // Leave GeoGebra's on-load callback queue before using its async queue.
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                if (disposed) return;
                // The native async queue waits for preloaded command modules.
                // Set only the existing UI perspective; create no fixture objects.
                await loaded.asyncEvalCommand('SetPerspective("G")');
              } catch {
                if (!disposed) setError("Không tải được bộ lệnh hình học. Hãy thử lại.");
                return;
              }
              if (disposed) {
                return;
              }
              clearTimeout(timeout);
              setError("");
              api.setPerspective("G");
              api.setErrorDialogsActive(false);
              api.setRounding("2");
              const adapter = new GeoGebraAdapter(api);
              if (!base64) { adapter.configureView(); adapter.resetView(); }
              observer = new ResizeObserver((entries) => {
                const b = entries[0].contentRect;
                api?.setSize(Math.round(b.width), Math.round(b.height));
              });
              observer.observe(host.current!);
              setReady(true);
              callback.current(adapter);
            },
          },
          true,
        );
        applet.inject(id);
      })
      .catch((e) => {
        clearTimeout(timeout);
        if (!disposed) setError(String(e.message));
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      observer?.disconnect();
      api?.remove();
    };
  }, [attempt]);
  return (
    <div className="engine-container" ref={host}>
      <div id={id} className="engine" />
      {!ready && !error && (
        <div className="engine-state">
          <span className="spinner" />
          Đang tải GeoGebra…
        </div>
      )}
      {error && (
        <div className="engine-state error" role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              setError("");
              setReady(false);
              setAttempt((v) => v + 1);
            }}
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
