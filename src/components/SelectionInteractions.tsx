import { supportsStroke } from "../geometry/GeometryState";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import {
  containedObjects,
  hitObject,
  screenShapes,
  selectionBounds,
  type ScreenBounds,
} from "../geometry/ScreenProjection";
import { IconButton } from "./Icon";
import { StrokeWidthSelect } from "./StrokeWidthSelect";
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
      if (
        disabled ||
        e.button !== 0 ||
        !(e.target instanceof Element) ||
        !e.target.closest(".main-engine")
      )
        return;
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
    node.addEventListener("contextmenu", context, true);
    window.addEventListener("keydown", cancel);
    return () => {
      node.removeEventListener("pointerdown", down, true);
      node.removeEventListener("pointermove", move, true);
      node.removeEventListener("pointerup", up, true);
      node.removeEventListener("pointercancel", up, true);
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
  const left = bounds
    ? Math.max(
        rect.left + 8,
        Math.min((bounds.left + bounds.right) / 2 - 130, rect.right - 280),
      )
    : 0;
  const top = bounds
    ? Math.max(rect.top + 60, Math.min(bounds.top - 52, rect.bottom - 50))
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
                  {["#23232D", "#4F18E9", "#09EFF8", "#E31665"].map((color) => (
                    <button
                      className="swatch"
                      key={color}
                      aria-label={`Đổi màu ${color}`}
                      style={{ background: color }}
                      onClick={() => style({ color })}
                    />
                  ))}
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
