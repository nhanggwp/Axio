import { useEffect, useState } from "react";
import { documentRequest, type CloudDocument } from "./client";
import { IconButton } from "../components/Icon";
export function WorkspaceDialog({
  userId,
  activeId,
  dirty,
  onClose,
  onLogin,
  onOpen,
  onSave,
  onNew,
  onRenamed,
  onDeleted,
}: {
  userId?: string;
  activeId?: string;
  dirty: boolean;
  onClose: () => void;
  onLogin: () => void;
  onOpen: (id: string) => Promise<void>;
  onSave: () => Promise<unknown>;
  onNew: () => void;
  onRenamed: (doc: CloudDocument) => void;
  onDeleted: (id: string) => void;
}) {
  const [docs, setDocs] = useState<CloudDocument[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<{
      kind: "open" | "delete" | "new";
      doc?: CloudDocument;
    } | null>(null),
    [renaming, setRenaming] = useState<string | null>(null),
    [name, setName] = useState("");
  const refresh = async () => {
    const result = await documentRequest<{ documents: CloudDocument[] }>("");
    setDocs(result.documents);
  };
  useEffect(() => {
    if (userId) void refresh().catch((e) => setError(e.message));
  }, [userId]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thao tác tài liệu.");
    } finally {
      setBusy(false);
    }
  };
  const perform = () => {
    const item = confirm;
    if (!item) return;
    setConfirm(null);
    void run(async () => {
      if (item.kind === "delete" && item.doc) {
        await documentRequest("/" + item.doc.id, { method: "DELETE" });
        onDeleted(item.doc.id);
        await refresh();
      }
      if (item.kind === "open" && item.doc) {
        await onOpen(item.doc.id);
        onClose();
      }
      if (item.kind === "new") {
        onNew();
        onClose();
      }
    });
  };
  return (
    <div className="modal-backdrop">
      <section
        className="workspace-dialog document-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Tài liệu của tôi"
      >
        <header>
          <h2>Tài liệu của tôi</h2>
          <IconButton
            icon="close"
            label="Đóng tài liệu tài khoản"
            onClick={onClose}
          />
        </header>
        {!userId ? (
          <>
            <p>
              Đăng nhập để lưu và mở tài liệu của riêng bạn trên máy chủ. Hình
              đang dựng được giữ nguyên.
            </p>
            <button className="primary" onClick={onLogin}>
              Đăng nhập để lưu
            </button>
          </>
        ) : (
          <>
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onSave();
                    await refresh();
                  })
                }
              >
                Lưu hình hiện tại
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (dirty) setConfirm({ kind: "new" });
                  else {
                    onNew();
                    onClose();
                  }
                }}
              >
                Tạo tài liệu
              </button>
            </div>
            <p>Tự lưu sau 1,5 giây khi sửa tài liệu đã lưu vào tài khoản.</p>
            <div className="account-document-list">
              {docs.length === 0 && (
                <p>Chưa có tài liệu. Lưu hình hiện tại để bắt đầu.</p>
              )}
              {docs.map((doc) => (
                <article key={doc.id}>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (dirty) setConfirm({ kind: "open", doc });
                      else
                        void run(async () => {
                          await onOpen(doc.id);
                          onClose();
                        });
                    }}
                  >
                    <b>
                      {doc.title}
                      {doc.id === activeId ? " · Đang mở" : ""}
                    </b>
                    <small>
                      {new Date(doc.updatedAt).toLocaleString("vi-VN")}
                    </small>
                  </button>
                  <button
                    aria-label={`Đổi tên ${doc.title}`}
                    onClick={() => {
                      setRenaming(doc.id);
                      setName(doc.title);
                    }}
                  >
                    Đổi tên
                  </button>
                  <IconButton
                    icon="delete"
                    label={`Xóa tài liệu ${doc.title}`}
                    onClick={() => setConfirm({ kind: "delete", doc })}
                  />
                  {renaming === doc.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          const updated = await documentRequest<CloudDocument>(
                            "/" + doc.id,
                            {
                              method: "PATCH",
                              body: JSON.stringify({
                                title: name,
                                version: doc.version,
                              }),
                            },
                          );
                          onRenamed(updated);
                          setRenaming(null);
                          await refresh();
                        });
                      }}
                    >
                      <input
                        aria-label="Tên tài liệu mới"
                        value={name}
                        required
                        maxLength={100}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <button disabled={busy}>Lưu tên</button>
                      <button type="button" onClick={() => setRenaming(null)}>
                        Hủy
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
        {error && (
          <p className="error-card" role="alert">
            {error}
          </p>
        )}
        {confirm && (
          <div className="error-card">
            <p>
              {confirm.kind === "delete"
                ? `Xóa vĩnh viễn tài liệu “${confirm.doc?.title}” trên máy chủ?`
                : "Hình hiện tại có thay đổi chưa lưu. Bạn muốn thay thế?"}
            </p>
            <div className="actions">
              <button onClick={() => setConfirm(null)}>Quay lại</button>
              <button onClick={perform}>Xác nhận</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
