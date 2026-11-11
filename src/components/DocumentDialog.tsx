import { useRef, useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { IconButton } from "./Icon";
export type SavedDocument = {
  id: string;
  title: string;
  data: string;
  date: string;
};
export function download(data: Blob | string, name: string) {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (typeof data !== "string")
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DocumentDialog({
  controller,
  title,
  setTitle,
  onClose,
  onError,
  kind,
  onNew,
  onLocalOpen,
}: {
  controller: GeometryController;
  title: string;
  setTitle: (title: string) => void;
  onClose: () => void;
  onError: (error: unknown) => void;
  kind: "documents" | "export" | "share";
  onNew: () => void;
  onLocalOpen: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title);
  const [saved, setSaved] = useState<SavedDocument[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("axio-documents") || "[]");
    } catch {
      return [];
    }
  });
  const [replace, setReplace] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [center, setCenter] = useState(true);
  const [grid, setGrid] = useState(false);
  const [axes, setAxes] = useState(() => controller.adapter.viewState().axes);
  const exportOptions = { center, grid, axes };
  const run = async (fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  const replacing = (fn: () => void) => {
    if (controller.dirty) setReplace(() => fn);
    else fn();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="document-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={
          kind === "share"
            ? "Chia sẻ hình"
            : kind === "export"
              ? "Xuất hình"
              : "Lưu và mở"
        }
      >
        <header>
          <h2>
            {kind === "share"
              ? "Chia sẻ hình dựng"
              : kind === "export"
                ? "Xuất hình dựng"
                : "Lưu và mở tài liệu"}
          </h2>
          <IconButton icon="close" label="Đóng hộp thoại" onClick={onClose} />
        </header>
        {kind === "documents" ? (
          <>
            <p>Tài liệu chỉ lưu trong trình duyệt trên thiết bị này.</p>
            <label className="field">
              Tên tài liệu
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </label>
            <div className="actions">
              <button
                className="primary"
                onClick={() =>
                  void run(async () => {
                    const data = await controller.adapter.base64();
                    const docs = [
                      {
                        id: crypto.randomUUID(),
                        title: name.trim() || "Hình dựng chưa đặt tên",
                        date: new Date().toISOString(),
                        data,
                      },
                      ...saved,
                    ].slice(0, 20);
                    localStorage.setItem(
                      "axio-documents",
                      JSON.stringify(docs),
                    );
                    setSaved(docs);
                    setTitle(docs[0].title);
                    controller.markSaved();
                    setNotice("Đã lưu trên thiết bị này.");
                  })
                }
              >
                Lưu trên thiết bị
              </button>
              <button
                onClick={() =>
                  replacing(() => {
                    onNew();
                    onClose();
                  })
                }
              >
                Tạo mới
              </button>
            </div>
            <h3>TÀI LIỆU ĐÃ LƯU</h3>
            <div className="saved-documents">
              {saved.length === 0 && <p>Chưa có tài liệu đã lưu.</p>}
              {saved.map((doc) => (
                <div key={doc.id}>
                  <button
                    onClick={() =>
                      replacing(
                        () =>
                          void run(async () => {
                            onLocalOpen();
                            await controller.openDocument(doc.data);
                            setTitle(doc.title);
                            onClose();
                          }),
                      )
                    }
                  >
                    <b>{doc.title}</b>
                    <small>{new Date(doc.date).toLocaleString("vi-VN")}</small>
                  </button>
                  <IconButton
                    icon="delete"
                    label={`Xóa bản lưu ${doc.title}`}
                    onClick={() => {
                      const docs = saved.filter((d) => d.id !== doc.id);
                      localStorage.setItem(
                        "axio-documents",
                        JSON.stringify(docs),
                      );
                      setSaved(docs);
                    }}
                  />
                </div>
              ))}
            </div>
            <button onClick={() => input.current?.click()}>
              Mở tệp .ggb từ máy
            </button>
            <input
              type="file"
              accept=".ggb"
              ref={input}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 15_000_000) {
                  onError(new Error("Tệp tối đa 15 MB."));
                  return;
                }
                replacing(() => {
                  const reader = new FileReader();
                  reader.onerror = () =>
                    onError(new Error("Không thể đọc tệp."));
                  reader.onload = () =>
                    void run(async () => {
                      onLocalOpen();
                      await controller.openDocument(
                        String(reader.result).split(",")[1],
                      );
                      setTitle(file.name.replace(/\.ggb$/, ""));
                      onClose();
                    });
                  reader.readAsDataURL(file);
                });
              }}
            />
          </>
        ) : (
          <>
            <p>Giữ đầy đủ quan hệ hình học bằng tệp GeoGebra.</p>
            <div className="export-options">
              <label className="check">
                <input
                  type="checkbox"
                  checked={center}
                  disabled={busy}
                  onChange={(e) => setCenter(e.target.checked)}
                />
                Căn giữa hình khi xuất
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={grid}
                  disabled={busy}
                  onChange={(e) => setGrid(e.target.checked)}
                />
                Lưới trong ảnh
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={axes}
                  disabled={busy}
                  onChange={(e) => setAxes(e.target.checked)}
                />
                Trục tọa độ trong ảnh
              </label>
            </div>
            <small>
              Ảnh được cắt sát hình, chừa viền cho nhãn. Bỏ căn giữa để xuất toàn bộ góc nhìn hiện tại.
            </small>
            {kind === "share" && (
              <>
                <p>
                  Chép ảnh để dán vào tin nhắn, hoặc tải ảnh để gửi. Hình không
                  được tự đăng công khai.
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (!navigator.clipboard?.write || !window.ClipboardItem)
                        throw new Error(
                          "Trình duyệt chưa hỗ trợ chép ảnh. Hãy tải PNG để gửi.",
                        );
                      const image = controller.adapter
                        .exportPNG(exportOptions)
                        .then((data) =>
                          fetch("data:image/png;base64," + data).then(
                            (response) => response.blob(),
                          ),
                        );
                      try {
                        await navigator.clipboard.write([
                          new ClipboardItem({ "image/png": image }),
                        ]);
                      } finally {
                        // A permission rejection can happen before the image finishes rendering.
                        await image.catch(() => {});
                      }
                      setNotice("Đã chép ảnh. Bạn có thể dán vào tin nhắn.");
                    })
                  }
                >
                  Chép ảnh vào clipboard
                </button>
              </>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  download(
                    "data:application/vnd.geogebra.file;base64," +
                      (await controller.adapter.base64()),
                    title + ".ggb",
                  ),
                )
              }
            >
              Tải xuống .ggb · chỉnh sửa được
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  download(
                    "data:image/png;base64," +
                      (await controller.adapter.exportPNG(exportOptions)),
                    title + ".png",
                  ),
                )
              }
            >
              Ảnh PNG · độ phân giải 2×
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const svg = await controller.adapter.exportSVG(exportOptions);
                  download(
                    new Blob([svg], { type: "image/svg+xml" }),
                    title + ".svg",
                  );
                })
              }
            >
              Ảnh vector SVG
            </button>
          </>
        )}
        {busy && <p role="status">Đang chuẩn bị tệp…</p>}
        {notice && <p role="status">{notice}</p>}
        {replace && (
          <div className="error-card">
            <p>Tài liệu có thay đổi chưa lưu. Bạn có muốn thay thế?</p>
            <div className="actions">
              <button onClick={() => setReplace(null)}>Quay lại</button>
              <button
                onClick={() => {
                  replace();
                  setReplace(null);
                }}
              >
                Thay thế tài liệu
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
