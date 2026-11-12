import { useEffect, useRef, useState } from "react";
import { IconButton } from "./Icon";

const seenKey = "axio-welcome-seen-v1";
const visitKey = "axio-welcome-visit-v2",
  hiddenKey = "axio-welcome-hidden-v2";
export function shouldShowWelcome() {
  if (
    ["reset", "verified"].includes(
      new URLSearchParams(location.search).get("auth") ?? "",
    )
  )
    return false;
  try {
    return (
      localStorage.getItem(hiddenKey) !== "1" &&
      sessionStorage.getItem(visitKey) !== "1"
    );
  } catch {
    return true;
  }
}

export function WelcomeScreen({ onClose }: { onClose: () => void }) {
  const [hideWelcome, setHideWelcome] = useState(() => {
    try {
      return localStorage.getItem(hiddenKey) === "1";
    } catch {
      return false;
    }
  });
  const [leaving, setLeaving] = useState(false);
  const start = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    start.current?.focus();
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => close.current(), 240);
    return () => clearTimeout(timer);
  }, [leaving]);
  const dismiss = () => {
    if (leaving) return;
    try {
      localStorage.setItem(seenKey, "1");
      sessionStorage.setItem(visitKey, "1");
      if (hideWelcome) localStorage.setItem(hiddenKey, "1");
      else localStorage.removeItem(hiddenKey);
    } catch {
      /* Welcome remains dismissible without browser storage. */
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else setLeaving(true);
  };
  return (
    <section
      ref={panel}
      className={`welcome-screen${leaving ? " welcome-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          dismiss();
        }
        if (event.key === "Tab") {
          const buttons = panel.current?.querySelectorAll<HTMLElement>(
            "button,a[href],input",
          );
          const first = buttons?.[0],
            last = buttons?.[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="welcome-panel">
        <header>
          <span className="welcome-wordmark">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M12 3 2 21h20Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            Axio
          </span>
          <IconButton icon="close" label="Bỏ qua lời chào" onClick={dismiss} />
        </header>
        <div className="welcome-content">
          <div className="welcome-copy">
            <h1 id="welcome-title">
              Chào mừng tới
              <br />
              <span>Axio</span>
            </h1>
            <p id="welcome-description">
              Nền tảng hỗ trợ vẽ hình và học toán cùng AI.
            </p>
            <button ref={start} className="welcome-start" onClick={dismiss}>
              Bắt đầu dựng hình
            </button>
            <a
              className="welcome-guide"
              href="/huong-dan/"
              target="_blank"
              rel="noreferrer"
            >
              Xem video hướng dẫn ↗
            </a>
            <label className="welcome-preference">
              <input
                type="checkbox"
                checked={hideWelcome}
                onChange={(e) => setHideWelcome(e.target.checked)}
              />
              Không hiện lại lời chào
            </label>
          </div>
          <div className="welcome-figure" aria-hidden="true">
            <svg className="welcome-geometry" viewBox="0 0 340 280">
              <defs>
                <pattern
                  id="welcome-grid"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M20 0H0V20"
                    fill="none"
                    stroke="var(--mist)"
                    strokeWidth=".6"
                  />
                </pattern>
              </defs>
              <rect width="340" height="280" fill="url(#welcome-grid)" />
              <path
                className="welcome-triangle"
                d="M106 224H214L106 44Z"
                pathLength="1"
              />
              <path className="welcome-angle" d="M106 212h12v12" />
              <g className="welcome-vertices">
                <circle cx="106" cy="224" r="3" />
                <circle cx="214" cy="224" r="3" />
                <circle cx="106" cy="44" r="3" />
                <text x="90" y="241">
                  A
                </text>
                <text x="223" y="237">
                  B
                </text>
                <text x="110" y="33">
                  C
                </text>
              </g>
              <g className="welcome-edge-labels">
                <text x="46" y="139">
                  AC = 5
                </text>
                <text x="137" y="247">
                  AB = 3
                </text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
