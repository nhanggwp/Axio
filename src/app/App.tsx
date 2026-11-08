import { useEffect, useRef, useState } from "react";
import { GeometryCanvas } from "../components/GeometryCanvas";
import { GeometryController } from "../geometry/GeometryController";
import { GeoGebraAdapter } from "../geometry/GeoGebraAdapter";
import { executeActions } from "../geometry/CommandExecutor";
import { validateDynamicGeometry } from "../geometry/GeometryChecks";
import { Toolbar } from "../components/Toolbar";
import { ObjectExplorer } from "../components/ObjectExplorer";
import { AIAssistant } from "../components/AIAssistant";
import { PropertyInspector } from "../components/PropertyInspector";
import { DocumentDialog } from "../components/DocumentDialog";
import { Icon, IconButton } from "../components/Icon";
import type { AIReply } from "../../shared/actions";
import { SelectionInteractions } from "../components/SelectionInteractions";
import { BatchInspector } from "../components/BatchInspector";
import { constructionKey } from "../geometry/GeometryState";
import { authClient } from "../auth/client";
import { AuthDialog, type AuthView } from "../auth/AuthDialog";
import { WorkspaceDialog } from "../workspace/WorkspaceDialog";
import { useWorkspace } from "../workspace/useWorkspace";
import { useViewport } from "../geometry/useViewport";
import { useEditorSessions } from "../sessions/useEditorSessions";
import { SessionControls } from "../sessions/SessionControls";
import type { ChatBridge } from "../sessions/model";
import { shouldShowWelcome, WelcomeScreen } from "../components/WelcomeScreen";
export default function App() {
  const [welcomeOpen, setWelcomeOpen] = useState(shouldShowWelcome);
  const welcomeWasOpen = useRef(welcomeOpen);
  const session = authClient.useSession();
  const [authView, setAuthView] = useState<AuthView | null>(() =>
    new URLSearchParams(location.search).get("auth") === "reset"
      ? "reset"
      : new URLSearchParams(location.search).get("auth") === "verified"
        ? "login"
        : null,
  );
  const [accountDocuments, setAccountDocuments] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [deletion, setDeletion] = useState<{
    names: string[];
    affected: string[];
  } | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!welcomeOpen && welcomeWasOpen.current) {
      welcomeWasOpen.current = false;
      canvasRef.current?.focus({ preventScroll: true });
    }
  }, [welcomeOpen]);

  const [controller, setController] = useState<GeometryController>();
  const [, render] = useState(0);
  const [title, setTitle] = useState("Hình dựng mới");
  const [right, setRight] = useState<"ai" | "properties" | null>("ai");
  const [explorer, setExplorer] = useState(() => window.innerWidth > 1100);
  const [mode, setMode] = useState(0);
  const clarificationRef = useRef(false);
  const [hint, setHint] = useState("Di chuyển · kéo đối tượng để khám phá");
  const { grid, axes, snap, zoom, fit } = useViewport(controller);
  const [dialog, setDialog] = useState<"documents" | "export" | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    id: string;
    reply: AIReply;
    data: string;
    baseline: string;
  } | null>(null);
  const previewCompletion = useRef<{
    resolve: () => void;
    reject: (e: unknown) => void;
  } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const workspace = useWorkspace(
    controller,
    title,
    setTitle,
    session.data?.user.id,
  );
  const chatBridge = useRef<ChatBridge | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const sessions = useEditorSessions({ controller, title, setTitle, userId: session.data?.user.id, identityReady: !session.isPending, workspace, chat: chatBridge, blocked: agentBusy || !!preview, onActivated: () => setRight("ai") });
  const sessionsDisabled = !sessions.ready || sessions.busy || agentBusy || !!preview || !!controller?.loading;
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((j) => setEmailConfigured(!!j.emailConfigured))
      .catch(() => {});
  }, []);
  function requestDelete() {
    if (!controller?.selectedNames.length) return;
    const names = [...controller.selectedNames],
      affected = controller.deletionImpact(names);
    if (affected.length > names.length || names.length > 1)
      setDeletion({ names, affected });
    else {
      try {
        controller.deleteSelection();
      } catch (e) {
        report(e);
      }
    }
  }
  const controllerRef = useRef<GeometryController | undefined>(undefined);
  controllerRef.current = controller;
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Thao tác không thành công.");
  useEffect(() => {
    if (!controller) return;
    let selection = controller.selection;
    return controller.subscribe(() => {
      render((v) => v + 1);
      if (
        controller.selection &&
        controller.selection !== selection &&
        controller.mode === 0 &&
        !clarificationRef.current
      )
        setRight("properties");
      selection = controller.selection;
    });
  }, [controller]);
  useEffect(() => () => controllerRef.current?.dispose(), []);
  useEffect(() => {
    const media = window.matchMedia("(max-width:1100px)");
    const changed = () => setExplorer(!media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (sessions.pendingSave || sessions.saving || sessions.error || (!sessions.ready && controller?.dirty)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [controller, sessions.pendingSave, sessions.saving, sessions.error, sessions.ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (sessions.busy || welcomeOpen) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof Element &&
          !!e.target.closest("[contenteditable=true]"))
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (!preview) {
          if (e.shiftKey) controller?.redo();
          else controller?.undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!preview) setDialog("documents");
      }
      if (e.key === "Escape") {
        setDialog(null);
        setPreview(null);
        controller?.select(null);
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        controller?.selection &&
        !preview
      ) {
        if (!dialog && !authView && !accountDocuments) {
          e.preventDefault();
          requestDelete();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [controller, preview, dialog, authView, accountDocuments, sessions.busy, welcomeOpen]);
  function ready(adapter: GeoGebraAdapter) {
    controllerRef.current?.dispose();
    const c = new GeometryController(adapter);
    try {
      const stored = JSON.parse(
        sessionStorage.getItem("axio-working-draft") || "null",
      );
      if (
        stored?.xml &&
        typeof stored.xml === "string" &&
        stored.xml.length < 20_000_000
      ) {
        c.mutate(() => adapter.restore(stored.xml));
        setTitle(
          typeof stored.title === "string"
            ? stored.title.slice(0, 100)
            : "Hình dựng mới",
        );
      }
    } catch {}
    setController(c);
    if (import.meta.env.DEV) window.axio = c;
  }
  async function beginPreview(reply: AIReply) {
    if (!controller) return;
    setError("");
    const baseline = constructionKey(controller.adapter.snapshot());
    const data = await controller.adapter.base64();
    setPreviewReady(false);
    return new Promise<void>((resolve, reject) => {
      previewCompletion.current = { resolve, reject };
      setPreview({ id: crypto.randomUUID(), reply, data, baseline });
    });
  }
  useEffect(() => {
    if (!preview && previewCompletion.current) {
      previewCompletion.current.resolve();
      previewCompletion.current = null;
    }
  }, [preview]);
  const selected = controller?.objects.find(
    (o) => o.name === controller.selection,
  );
  const select = (name: string, additive = false) => {
    if (additive) controller?.toggleSelection(name);
    else controller?.select(name);
    if (!clarificationRef.current) setRight("properties");
  };
  const apply = () => {
    if (!controller || !preview || !previewReady) return false;
    try {
      if (constructionKey(controller.adapter.snapshot()) !== preview.baseline)
        throw new Error("Hình đã thay đổi. Hãy yêu cầu xem trước lại.");
      controller.apply(preview.reply.actions, preview.reply.checks);
      if (preview.reply.actions.some((a) => a.type === "point" || a.type === "construct" || a.type === "altitude")) controller.adapter.resetView();
      setPreview(null);
      return true;
    } catch (e) {
      setPreview(null);
      report(e);
      return false;
    }
  };
  return (
    <><main className="application" inert={welcomeOpen}>
      <header className="topbar">
        <div className="brand">
          <Icon name="polygon" />
          <strong>Hình học</strong>
        </div>
        <button
          className="document-title"
          onClick={() => setDialog("documents")}
          disabled={!controller || !!preview}
        >
          {title}
        </button>
        <IconButton
          icon="undo"
          label="Hoàn tác"
          disabled={!controller?.history.canUndo || !!preview}
          onClick={() => controller?.undo()}
        />
        <IconButton
          className="redo-button"
          icon="redo"
          label="Làm lại"
          disabled={!controller?.history.canRedo || !!preview}
          onClick={() => controller?.redo()}
        />
        <span className="spacer" />
        <button
          className="account-documents-button"
          disabled={!controller || !!preview}
          onClick={() => setAccountDocuments(true)}
        >
          Tài liệu của tôi
        </button>
        <button
          className="account-button"
          disabled={session.isPending}
          onClick={() => setAuthView(session.data ? "profile" : "login")}
        >
          {session.isPending
            ? "Đang tải…"
            : session.data?.user.name || "Đăng nhập"}
        </button>
        <small className="save-status">
          {workspace.active
            ? workspace.status
            : controller?.dirty
              ? "Có thay đổi chưa lưu"
              : "Chưa lưu"}
        </small>
        <button
          className="export-button"
          disabled={!controller || !!preview}
          onClick={() => setDialog("export")}
        >
          Xuất
        </button>
        <button
          className="primary share-button"
          disabled={!controller || !!preview}
          onClick={() => setDialog("export")}
        >
          Chia sẻ
        </button>
        <IconButton
          icon="panel"
          label="Ẩn / hiện trợ lý AI"
          className={right === "ai" ? "active" : ""}
          onClick={() => setRight(right === "ai" ? null : "ai")}
        />
      </header>
      <SessionControls manager={sessions} disabled={sessionsDisabled} />
      <div className="editor">
        <Toolbar
          disabled={!controller || !!preview}
          mode={mode}
          onTool={(id, label, h) => {
            controller?.setMode(id);
            setMode(id);
            setHint(`${label} · ${h}`);
          }}
        />
        {explorer && (
          <ObjectExplorer
            controller={controller}
            onClose={() => setExplorer(false)}
            onSelect={select}
          />
        )}
        <section
          ref={canvasRef}
          tabIndex={0}
          className="workspace"
          aria-label="Vùng vẽ hình học"
        >
          <div
            className={preview ? "main-engine preview-hidden" : "main-engine"}
          >
            <GeometryCanvas onReady={ready} />
          </div>
          {preview && (
            <div className="preview-engine">
              <GeometryCanvas
                key={preview.id}
                base64={preview.data}
                onReady={(adapter) => {
                  try {
                    executeActions(adapter, preview.reply.actions, preview.reply.checks);
                    validateDynamicGeometry(adapter, preview.reply.checks);
                    if (preview.reply.actions.some((a) => a.type === "point" || a.type === "construct" || a.type === "altitude")) adapter.resetView();
                    for (const o of adapter.objects())
                      if (
                        !controller?.adapter.api.exists(o.name) &&
                        ["line", "segment", "circle", "conic"].includes(o.type)
                      )
                        adapter.api.setLineStyle(o.name, 1);
                    setPreviewReady(true);
                    previewCompletion.current?.resolve();
                    previewCompletion.current = null;
                  } catch (e) {
                    previewCompletion.current?.reject(e);
                    previewCompletion.current = null;
                    setPreview(null);
                  }
                }}
              />
            </div>
          )}
          <div className="canvas-controls">
            <span>{controller?.drawingFeedback || hint}</span>
            <span className="spacer" />
            <IconButton
              icon="grid"
              label="Ẩn / hiện lưới"
              className={grid ? "active" : ""}
              disabled={!controller || !!preview}
              onClick={() => {
                controller?.adapter.api.setGridVisible(!grid);
                controller?.sync();
              }}
            />
            <IconButton
              icon="axes"
              label="Ẩn / hiện trục tọa độ"
              className={axes ? "active" : ""}
              disabled={!controller || !!preview}
              onClick={() => {
                controller?.adapter.api.setAxesVisible(!axes, !axes);
                controller?.sync();
              }}
            />
            <IconButton
              icon="reset"
              label="Đặt lại góc nhìn"
              disabled={!controller || !!preview}
              onClick={() => {
                fit();
              }}
            />
          </div>
          {preview && (
            <div className="preview-banner">
              <b>XEM TRƯỚC</b>Thay đổi chưa được áp dụng.
            </div>
          )}
          <SelectionInteractions
            controller={controller}
            host={canvasRef}
            disabled={!!preview}
            onDelete={requestDelete}
            onProperties={() => setRight("properties")}
            onError={report}
          />
          <div className="canvas-bottom">
            {!explorer && (
              <button onClick={() => setExplorer(true)}>
                Đối tượng · {controller?.objects.length || 0}
              </button>
            )}
            <button
              className="tablet-ai primary"
              onClick={() => setRight("ai")}
            >
              Hỏi trợ lý hình học
            </button>
            <span className="spacer" />
            <div className="zoom">
              <button
                aria-label="Thu nhỏ"
                disabled={!controller || !!preview}
                onClick={() => {
                  controller?.adapter.command("ZoomIn(0.8)");
                  controller?.sync();
                }}
              >
                −
              </button>
              <span>{zoom === undefined ? "—" : `${zoom}%`}</span>
              <button
                aria-label="Phóng to"
                disabled={!controller || !!preview}
                onClick={() => {
                  controller?.adapter.command("ZoomIn(1.25)");
                  controller?.sync();
                }}
              >
                +
              </button>
            </div>
          </div>
        </section>
        {
          <div className={right === "ai" ? "ai-slot" : "panel-hidden"}>
            <AIAssistant
              key={sessions.chatKey ?? "initial"}
              chatRef={chatBridge}
              initialChat={sessions.initialChat}
              onDraftChange={sessions.changed}
              onBusyChange={setAgentBusy}
              suspended={sessions.busy}
              onClarification={(pending) => {
                clarificationRef.current = pending;
              }}
              controller={controller}
              onClose={() => setRight(null)}
              onPreview={beginPreview}
              preview={preview?.reply || null}
              onCancel={() => setPreview(null)}
              onApply={apply}
              previewReady={previewReady}
            />
          </div>
        }{" "}
        {right === "properties" &&
          controller &&
          (controller.selectedNames.length > 1 ? (
            <BatchInspector
              controller={controller}
              onClose={() => setRight("ai")}
              onDelete={requestDelete}
              onError={report}
            />
          ) : (
            <PropertyInspector
              onDelete={requestDelete}
              controller={controller}
              onClose={() => setRight("ai")}
              onError={report}
            />
          ))}
      </div>
      {sessions.busy && <div className="session-loading" role="status"><span className="spinner" />Đang cập nhật phiên làm việc…</div>}
      <footer className="statusbar">
        <span>Hình học 2D</span>
        <button
          disabled={!controller || !!preview}
          onClick={() => {
            controller?.adapter.api.setPointCapture(1, snap ? 0 : 1);
            controller?.sync();
          }}
        >
          Bám lưới: {snap === undefined ? "…" : snap ? "bật" : "tắt"}
        </button>
        <a href="https://www.geogebra.org" target="_blank" rel="noreferrer">
          © GeoGebra®
        </a>
        <span className="spacer" />
        {selected?.type === "point" && (
          <span>
            x: {selected.x?.toFixed(2)} y: {selected.y?.toFixed(2)}
          </span>
        )}
        <span>Độ · Đơn vị</span>
      </footer>
      {dialog && controller && (
        <DocumentDialog
          kind={dialog}
          title={title}
          setTitle={setTitle}
          onLocalOpen={workspace.detach}
          onNew={() => {
            workspace.detach();
            controller.newDocument();
            setTitle("Hình dựng mới");
          }}
          controller={controller}
          onClose={() => setDialog(null)}
          onError={report}
        />
      )}{" "}
      {accountDocuments && (
        <WorkspaceDialog
          userId={session.data?.user.id}
          activeId={workspace.active?.id}
          dirty={!!controller?.dirty}
          onClose={() => setAccountDocuments(false)}
          onLogin={() => {
            setAccountDocuments(false);
            setAuthView("login");
          }}
          onSave={() => workspace.save()}
          onRenamed={workspace.renamed}
          onDeleted={workspace.deleted}
          onOpen={workspace.open}
          onNew={() => {
            workspace.detach();
            controller?.newDocument();
            setTitle("Hình dựng mới");
          }}
        />
      )}
      {authView && (
        <AuthDialog
          initialView={authView}
          user={session.data?.user ?? null}
          emailConfigured={emailConfigured}
          onClose={() => {
            setAuthView(null);
            window.history.replaceState({}, "", location.pathname);
          }}
          onAuthenticated={() => void session.refetch()}
        />
      )}
      {deletion && (
        <div className="modal-backdrop">
          <section
            className="document-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Xác nhận xóa đối tượng"
          >
            <h2>Xóa {deletion.names.length} đối tượng?</h2>
            <p>Đối tượng đã chọn: {deletion.names.join(", ")}</p>
            <p>Các đối tượng bị ảnh hưởng: {deletion.affected.join(", ")}</p>
            <small>
              Các hình phụ thuộc sẽ bị xóa cùng. Bạn có thể hoàn tác bằng một
              bước.
            </small>
            <div className="actions">
              <button onClick={() => setDeletion(null)}>Giữ lại</button>
              <button
                onClick={() => {
                  try {
                    controller?.selectMany(deletion.names);
                    controller?.deleteSelection();
                    setDeletion(null);
                  } catch (e) {
                    report(e);
                  }
                }}
              >
                Xóa và các hình phụ thuộc
              </button>
            </div>
          </section>
        </div>
      )}
      {workspace.error && (
        <div className="save-error" role="alert">
          {workspace.error}
          <button onClick={() => void workspace.save(true).catch(report)}>
            Lưu thành bản mới
          </button>
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          <p>{error}</p>
          <IconButton
            icon="close"
            label="Đóng thông báo"
            onClick={() => setError("")}
          />
        </div>
      )}
    </main>{welcomeOpen && <WelcomeScreen onClose={() => setWelcomeOpen(false)} />}</>
  );
}
