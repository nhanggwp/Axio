import { supportsStroke } from "../geometry/GeometryState";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { GeometryController, TransformHandle } from "../geometry/GeometryController";
import {
  containedObjects,
  hitObject,
  screenShapes,
  selectionBounds,
  type ScreenBounds,
} from "../geometry/ScreenProjection";
import { IconButton } from "./Icon";
import { StrokeWidthSelect } from "./StrokeWidthSelect";

const SWATCH_COLORS = [
  "#23232D",
  "#4F18E9",
  "#09EFF8",
  "#E31665",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
] as const;

const RESIZE_HANDLES: readonly { id: TransformHandle; label: string }[] = [
  { id: "nw", label: "Co giãn góc trên trái" },
  { id: "n", label: "Co giãn cạnh trên" },
  { id: "ne", label: "Co giãn góc trên phải" },
  { id: "e", label: "Co giãn cạnh phải" },
  { id: "se", label: "Co giãn góc dưới phải" },
  { id: "s", label: "Co giãn cạnh dưới" },
  { id: "sw", label: "Co giãn góc dưới trái" },
  { id: "w", label: "Co giãn cạnh trái" },
];

const TRANSFORM_PAD = 18;

export function SelectionInteractions({
  controller,
  host,
  disabled,
  onDelete,
  onProperties,
  onError,
}: {
  controller?: GeometryController;
  host: RefObject<HTMLElement | null>;
  disabled: boolean;
  onDelete: () => void;
  onProperties: () => void;
  onError: (e: unknown) => void;
}) {
  const [box, setBox] = useState<ScreenBounds | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [popover, setPopover] = useState(false);
  const [, redraw] = useState(0);
  const start = useRef<{
    x: number;
    y: number;
    extend: boolean;
    before: string[];
  } | null>(null);
  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(() => redraw((v) => v + 1));
  }, [controller]);
  useEffect(() => {
    const node = host.current;
    if (!node || !controller) return;
    const down = (e: PointerEvent) => {
      if (disabled || e.button !== 0 || !(e.target instanceof Element)) return;
      const handleEl = e.target.closest("[data-handle]");
      if (handleEl && controller.mode === 0) {
        const handle = handleEl.getAttribute("data-handle") as TransformHandle;
        if (controller.beginTransform(handle, e.clientX, e.clientY, node)) {
          e.preventDefault();
          e.stopPropagation();
          node.setPointerCapture(e.pointerId);
          setMenu(null);
          setPopover(false);
          return;
        }
      }
      if (!e.target.closest(".main-engine")) return;
      node.focus({ preventScroll: true });
      const hit =
        controller.mode === 0
          ? hitObject(screenShapes(controller, node), {
              x: e.clientX,
              y: e.clientY,
            })
          : null;
      controller.beginPointer(
        e.shiftKey || e.ctrlKey || e.metaKey,
        hit,
        e.clientX,
        e.clientY,
        node,
      );
      setMenu(null);
      setPopover(false);
      if (controller.mode !== 0) return;
      if (controller.hasProxyDrag) {
        e.preventDefault();
        e.stopPropagation();
        node.setPointerCapture(e.pointerId);
        return;
      }
      if (hit) return;
      e.preventDefault();
      e.stopPropagation();
      start.current = {
        x: e.clientX,
        y: e.clientY,
        extend: e.shiftKey || e.ctrlKey || e.metaKey,
        before: [...controller.selectedNames],
      };
      node.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      controller.movePointer(e.clientX, e.clientY, node);
      if (controller.hasProxyDrag) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const p = start.current;
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4)
        setBox({
          left: Math.min(p.x, e.clientX),
          right: Math.max(p.x, e.clientX),
          top: Math.min(p.y, e.clientY),
          bottom: Math.max(p.y, e.clientY),
        });
    };
    const up = (e: PointerEvent) => {
      const p = start.current;
      if (p) {
        e.preventDefault();
        e.stopPropagation();
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
          const selected = containedObjects(screenShapes(controller, node), {
            left: Math.min(p.x, e.clientX),
            right: Math.max(p.x, e.clientX),
            top: Math.min(p.y, e.clientY),
            bottom: Math.max(p.y, e.clientY),
          });
          controller.selectMany(
            p.extend ? [...p.before, ...selected] : selected,
          );
        } else if (!p.extend) controller.select(null);
        start.current = null;
        setBox(null);
      }
      if (node.hasPointerCapture(e.pointerId))
        node.releasePointerCapture(e.pointerId);
      if (controller.hasProxyDrag) {
        e.preventDefault();
        e.stopPropagation();
        controller.endPointer();
        return;
      }
      setTimeout(() => controller.endPointer(), 0);
    };
    const wheel = (e: WheelEvent) => {
      if (
        disabled ||
        !(e.target instanceof Element) ||
        !e.target.closest(".main-engine") ||
        Math.abs(e.deltaY) < 1
      )
        return;
      e.preventDefault();
      const api = controller.adapter.api;
      const v = JSON.parse(api.getViewProperties(1)) as {
        xMin: number;
        yMin: number;
        width: number;
        height: number;
        invXscale: number;
        invYscale: number;
      };
      const panel = (node.querySelector(".EuclidianPanel") ?? node).getBoundingClientRect();
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      const wx = v.xMin + (e.clientX - panel.left) * v.invXscale;
      const wy = v.yMin + (v.height - (e.clientY - panel.top)) * v.invYscale;
      const xMax = v.xMin + v.width * v.invXscale;
      const yMax = v.yMin + v.height * v.invYscale;
      const nextXMin = wx - (wx - v.xMin) * factor;
      const nextXMax = wx + (xMax - wx) * factor;
      const nextYMin = wy - (wy - v.yMin) * factor;
      const nextYMax = wy + (yMax - wy) * factor;
      if (nextXMax - nextXMin > 0.2 && nextXMax - nextXMin < 5000) {
        api.setCoordSystem(nextXMin, nextXMax, nextYMin, nextYMax);
        controller.sync();
      }
    };
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        start.current = null;
        setBox(null);
        setMenu(null);
        setPopover(false);
        controller.select(null);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "a" &&
        node.contains(document.activeElement) &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        controller.selectMany(
          controller.objects.filter((o) => o.visible).map((o) => o.name),
        );
      }
    };
    const context = (e: MouseEvent) => {
      if (
        disabled ||
        !(e.target instanceof Element) ||
        !e.target.closest(".main-engine")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const hit = hitObject(screenShapes(controller, node), {
        x: e.clientX,
        y: e.clientY,
      });
      if (hit && !controller.selectedNames.includes(hit))
        controller.select(hit);
      else if (!hit) controller.select(null);
      const rect = node.getBoundingClientRect();
      setMenu({
        x: Math.min(Math.max(rect.left + 8, e.clientX), rect.right - 208),
        y: Math.min(Math.max(rect.top + 8, e.clientY), rect.bottom - 264),
      });
    };
    node.addEventListener("pointerdown", down, true);
    node.addEventListener("pointermove", move, true);
    node.addEventListener("pointerup", up, true);
    node.addEventListener("pointercancel", up, true);
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("contextmenu", context, true);
    window.addEventListener("keydown", cancel);
    return () => {
      node.removeEventListener("pointerdown", down, true);
      node.removeEventListener("pointermove", move, true);
      node.removeEventListener("pointerup", up, true);
      node.removeEventListener("pointercancel", up, true);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("contextmenu", context, true);
      window.removeEventListener("keydown", cancel);
    };
  }, [controller, disabled, host]);
  if (!controller || !host.current || disabled) return null;
  const rect = host.current.getBoundingClientRect(),
    bounds = selectionBounds(controller, host.current);
  const selected = controller.selectedNames;
  const selectedObjects = controller.objects.filter((o) =>
    selected.includes(o.name),
  );
  const visibleNames = controller.objects.filter((o) => o.visible).map((o) => o.name);
  const showTransformBox =
    selected.length > 0 &&
    !!bounds &&
    (bounds.right - bounds.left > 8 || bounds.bottom - bounds.top > 8) &&
    controller.mode === 0;
  const execute = (fn: () => void) => {
    try {
      fn();
      setMenu(null);
    } catch (e) {
      onError(e);
    }
  };
  const style = (props: {
    color?: string;
    thickness?: number;
    visible?: boolean;
  }) =>
    execute(() =>
      controller.apply(
        selected
          .filter(
            (target) =>
              !props.thickness ||
              supportsStroke(
                controller.objects.find((o) => o.name === target)?.type ?? "",
              ),
          )
          .map((target) => ({ type: "style", target, ...props })),
      ),
    );
  const topOffset = showTransformBox ? TRANSFORM_PAD + 64 : 52;
  const left = bounds
    ? Math.max(
        rect.left + 8,
        Math.min((bounds.left + bounds.right) / 2 - 150, rect.right - 320),
      )
    : 0;
  const top = bounds
    ? Math.max(rect.top + 60, Math.min(bounds.top - topOffset, rect.bottom - 50))
    : 0;
  return (
    <>
      {box && (
        <div
          className="selection-marquee"
          data-testid="selection-marquee"
          style={{
            left: box.left - rect.left,
            top: box.top - rect.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
          }}
        />
      )}
      {showTransformBox && bounds && (
        <div
          className="transform-box"
          data-testid="transform-box"
          style={{
            left: bounds.left - rect.left - TRANSFORM_PAD,
            top: bounds.top - rect.top - TRANSFORM_PAD,
            width: bounds.right - bounds.left + TRANSFORM_PAD * 2,
            height: bounds.bottom - bounds.top + TRANSFORM_PAD * 2,
          }}
        >
          <button
            type="button"
            className="transform-rotate"
            data-handle="rotate"
            aria-label="Xoay hình"
            title="Kéo để xoay hình"
          />
          {RESIZE_HANDLES.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`transform-handle handle-${h.id}`}
              data-handle={h.id}
              aria-label={h.label}
              title={h.label}
            />
          ))}
        </div>
      )}
      {selected.length > 0 &&
        bounds &&
        !controller.interacting &&
        controller.mode === 0 && (
          <div
            className="selection-toolbar"
            role="toolbar"
            aria-label="Thao tác đối tượng"
            style={{ left: left - rect.left, top: top - rect.top }}
          >
            <button
              onClick={() => setPopover(!popover)}
              aria-expanded={popover}
            >
              Kiểu nét · {selected.length}
            </button>
            {visibleNames.length > 1 && selected.length < visibleNames.length && (
              <button
                onClick={() => controller.selectMany(visibleNames)}
                title="Chọn toàn bộ hình để phóng to, thu nhỏ hoặc xoay"
              >
                Chọn cả hình
              </button>
            )}
            <IconButton
              icon="eye"
              label="Ẩn đối tượng đã chọn"
              onClick={() => style({ visible: false })}
            />
            <IconButton
              icon="delete"
              label="Xóa đối tượng đã chọn"
              onClick={onDelete}
            />
            <button onClick={onProperties}>Thuộc tính</button>
            {popover && (
              <div
                className="style-popover"
                style={
                  top + 230 > rect.bottom
                    ? { top: "auto", bottom: "calc(100% + 6px)" }
                    : {}
                }
              >
                <span>Màu nét</span>
                <div className="actions">
                  {SWATCH_COLORS.map((color) => (
                    <button
                      className="swatch"
                      key={color}
                      aria-label={`Đổi màu ${color}`}
                      style={{ background: color }}
                      onClick={() => style({ color })}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Đổi màu tùy chỉnh"
                    defaultValue={selectedObjects[0]?.color || "#23232D"}
                    onChange={(e) => style({ color: e.target.value.toUpperCase() })}
                  />
                </div>
                <label>
                  Độ dày
                  <StrokeWidthSelect label="Độ dày chung" objects={selectedObjects} onChange={(thickness) => style({ thickness })} />
                </label>
                <button
                  onClick={() =>
                    execute(() =>
                      controller.mutate(() =>
                        selected.forEach((n) =>
                          controller.adapter.api.setLabelVisible(
                            n,
                            !selectedObjects.every((o) => o.labelVisible),
                          ),
                        ),
                      ),
                    )
                  }
                >
                  Ẩn / hiện nhãn
                </button>
              </div>
            )}
          </div>
        )}
      {menu && (
        <>
          <button
            className="context-dismiss"
            aria-label="Đóng trình đơn ngữ cảnh"
            onClick={() => setMenu(null)}
          />
          <div
            className="context-menu"
            role="menu"
            style={{ left: menu.x - rect.left, top: menu.y - rect.top }}
          >
            {selected.length ? (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    onProperties();
                    setMenu(null);
                  }}
                >
                  Thuộc tính / Đổi tên
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    style({ visible: !selectedObjects.every((o) => o.visible) })
                  }
                >
                  Ẩn / Hiện
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    execute(() =>
                      controller.mutate(() =>
                        selectedObjects
                          .filter((o) => o.independent)
                          .forEach((o) =>
                            controller.adapter.api.setFixed(
                              o.name,
                              o.moveable,
                              true,
                            ),
                          ),
                      ),
                    )
                  }
                  disabled={!selectedObjects.some((o) => o.independent)}
                >
                  Khóa / Mở khóa
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    onProperties();
                    setMenu(null);
                  }}
                >
                  Xem quan hệ phụ thuộc
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    onDelete();
                    setMenu(null);
                  }}
                >
                  Xóa đối tượng đã chọn
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    controller.select(null);
                    setMenu(null);
                  }}
                >
                  Bỏ chọn
                </button>
              </>
            ) : (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    controller.selectMany(
                      controller.objects
                        .filter((o) => o.visible)
                        .map((o) => o.name),
                    );
                    setMenu(null);
                  }}
                >
                  Chọn tất cả
                </button>
                <button
                  role="menuitem"
                  disabled={!controller.history.canUndo}
                  onClick={() => execute(() => controller.undo())}
                >
                  Hoàn tác
                </button>
                <button
                  role="menuitem"
                  onClick={() => execute(() => controller.adapter.resetView())}
                >
                  Vừa với hình dựng
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
