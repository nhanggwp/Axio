import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import type { AIReply, GeometryObject } from "../../shared/actions";
import type { GeometryController } from "../geometry/GeometryController";
import { useAgentConversation } from "../services/ai/useAgentConversation";
import { IconButton } from "./Icon";
import type { ChatBridge, ChatDraft } from "../sessions/model";
export function AIAssistant({
  controller,
  onClose,
  onPreview,
  preview,
  previewObjects,
  onCancel,
  onApply,
  previewReady,
  onClarification,
  chatRef,
  initialChat,
  onDraftChange,
  onBusyChange,
  suspended,
}: {
  controller?: GeometryController;
  onClose: () => void;
  onPreview: (reply: AIReply) => Promise<void>;
  preview: AIReply | null;
  previewObjects?: GeometryObject[];
  onCancel: () => void;
  onApply: () => boolean;
  previewReady: boolean;
  onClarification: (pending: boolean) => void;
  chatRef: RefObject<ChatBridge | null>;
  initialChat?: ChatDraft;
  onDraftChange: () => void;
  onBusyChange: (busy: boolean) => void;
  suspended: boolean;
}) {
  const [dailyLimitEnabled, setDailyLimitEnabled] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const agent = useAgentConversation(
      controller,
      configured,
      preview,
      onPreview,
      onClarification,
      onCancel,
      initialChat,
      suspended,
      previewObjects,
    ),
    conversationRef = useRef<HTMLDivElement>(null),
    followBottom = useRef(true);
  const [request, setRequest] = useState(agent.initialComposer);
  useImperativeHandle(chatRef, () => ({ busy: agent.busy, capture: () => ({ messages: agent.messages, pending: agent.pending, composer: request }) }), [agent.busy, agent.messages, agent.pending, request]);
  useEffect(() => { onDraftChange(); }, [agent.messages, agent.pending, request, onDraftChange]);
  useEffect(() => { onBusyChange(agent.busy); }, [agent.busy, onBusyChange]);
  useEffect(() => {
    const el = conversationRef.current;
    if (el && followBottom.current) el.scrollTop = el.scrollHeight;
  }, [
    agent.messages,
    agent.pending,
    agent.error,
    agent.busy,
    agent.partial,
    agent.phase,
    preview,
    previewReady,
  ]);
  const checkConnection = () => {
    setConfigured(null);
    agent.setError("");
    return fetch("/api/status")
      .then((r) => r.json())
      .then((j) => {
        const accepted = !Array.isArray(j.allowedOrigins) || j.allowedOrigins.includes(location.origin);
        setConfigured(!!j.configured && accepted);
        setDailyLimitEnabled(j.dailyLimitEnabled !== false);
        if (!accepted) agent.setError(`Địa chỉ truy cập chưa khớp với máy chủ. Hãy mở Axio tại ${j.allowedOrigins[0]}.`);
      })
      .catch(() => {
        setConfigured(false);
        agent.setError("Không kết nối được máy chủ trợ lý.");
      });
  };
  useEffect(() => {
    void checkConnection();
  }, []);
  const send = () => {
    if (!request.trim()) return;
    followBottom.current = true;
    void agent.submit(request);
    if (configured && !agent.busy && !suspended) setRequest("");
  };
  const pointNames =
    controller?.objects.filter((o) => o.type === "point").map((o) => o.name) ??
    [];
  const clarification = [...agent.messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.status === "needs_clarification");
  const selectable = agent.pending?.selection_request;
  const latestReply = [...agent.messages].reverse().find((m) => m.role === "assistant" && m.source === "deepseek");
  const canSelect =
    selectable &&
    (controller?.objects.filter((o) => selectable.allowed_types.includes(o.type))
      .length ?? 0) >= selectable.min;
  return (
    <aside className="assistant">
      <header>
        <strong>Trợ lý hình học</strong>
        <IconButton
          icon="close"
          label="Đóng bảng trợ lý AI"
          onClick={onClose}
        />
      </header>
      <div className="conversation" ref={conversationRef} aria-live="polite" onScroll={() => {
        const el = conversationRef.current;
        if (el) followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}>
        <p className="eyebrow">HÌNH ĐANG DỰNG</p>
        {agent.messages.length === 0 && (
          <>
            <div className="message assistant-introduction">
              <b>BẮT ĐẦU HỘI THOẠI</b>
              <p>
                Mô tả hình cần dựng, hỏi cách dựng hoặc chọn đối tượng để chỉnh
                sửa. Mọi thay đổi đều được xem trước.
              </p>
            </div>
            <div className="suggestions" aria-label="Ví dụ yêu cầu">
              {(pointNames.length
                ? [
                    "Giải thích quan hệ giữa các đối tượng đang chọn.",
                    "Kiểm tra các quan hệ hình học trong hình hiện tại.",
                  ]
                : [
                    "Vẽ một tam giác bất kỳ.",
                    "Vẽ đường tròn bán kính 5.",
                  ]
              ).map((s) => (
                <button
                  key={s}
                  disabled={!controller || !configured}
                  onClick={() => setRequest(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <small>
              {controller?.objects.length
                ? `${controller.objects.length} đối tượng từ hình dựng hiện tại.`
                : "Vùng vẽ đang trống. Bạn có thể dựng thủ công hoặc bắt đầu bằng mô tả."}
            </small>
          </>
        )}
        {agent.messages.map((m, i) => (
          <div
            key={m.id ?? i}
            className={`message ${m.role === "user" ? "user-message" : "assistant-message"}`}
          >
            <b>
              {m.role === "user"
                ? "BẠN"
                : m.source === "validation"
                  ? "KIỂM TRA & THAO TÁC"
                  : "TRỢ LÝ"}
            </b>
            <p>{m.content}</p>
            {m.outcome && (
              <small className={`message-outcome ${m.outcome}`}>
                {{ proposed: "Đang kiểm tra đề xuất…", previewed: "Đã kiểm tra · chờ bạn áp dụng", applied: "Đã áp dụng thay đổi và kiểm tra hình dựng", cancelled: "Đã bỏ đề xuất này", execution_error: "Chưa áp dụng · phép dựng có lỗi" }[m.outcome]}
              </small>
            )}
            {m.status === "interrupted" && <small className="message-outcome">Đã dừng phản hồi</small>}
          </div>
        ))}
        {agent.busy && agent.partial && (
          <div className="message assistant-message streaming-message" aria-label="Phản hồi đang nhận">
            <b>TRỢ LÝ</b><p>{agent.partial}</p>
          </div>
        )}
        {agent.busy && (
          <div className="processing">
            <span className="spinner" />
            {agent.phase === "preview" ? "Đang dựng thử bằng GeoGebra…" : agent.phase === "repairing" ? "Đang điều chỉnh kế hoạch theo lỗi kiểm tra…" : agent.phase === "validating" ? "Đang kiểm tra kế hoạch…" : agent.partial ? "Đang nhận phản hồi…" : "Đang đọc hình và hội thoại…"}
          </div>
        )}
        {!agent.busy && !!latestReply?.suggestions?.length && (
          <div className="suggestions" aria-label="Gợi ý tiếp nối">
            {latestReply.suggestions.map((suggestion) => <button key={suggestion} onClick={() => { followBottom.current = true; void agent.submit(suggestion); }}>{suggestion}</button>)}
          </div>
        )}
        {agent.pending && (
          <div className="clarification">
            <b>Cần làm rõ yêu cầu · bước {agent.pending.step}/4</b>
            <p>{clarification?.content}</p>
            <small>Yêu cầu đang chờ: {agent.pending.original_request}</small>
            {Object.values(agent.pending.resolved).length > 0 && (
              <small>
                Đã xác định: {Object.values(agent.pending.resolved).join(" · ")}
              </small>
            )}
            <p>
              {canSelect
                ? "Chọn đối tượng phù hợp trên vùng vẽ hoặc danh sách. Trợ lý sẽ tự tiếp tục; bạn cũng có thể nhập câu trả lời."
                : selectable
                  ? "Nhập thông tin còn thiếu; bạn cũng có thể dựng đối tượng cần dùng rồi chọn để tiếp tục."
                  : "Nhập thêm thông tin trong ô yêu cầu để tiếp tục."}
            </p>
            <button onClick={agent.cancel}>Hủy yêu cầu đang chờ</button>
          </div>
        )}
        {agent.error && (
          <div className="error-card" role="alert">
            <b>Chưa thể thực hiện</b>
            <p>{agent.error}</p>
          </div>
        )}
        {preview && (
          <>
            <div className="preview-card">
              <b>Xem trước thay đổi</b>
              <small>
                {preview.actions.length} thao tác ·{" "}
                {previewReady
                  ? "Đã kiểm tra bằng GeoGebra"
                  : "Đang kiểm tra hình dựng…"}
              </small>
            </div>
            <div className="actions">
              <button
                disabled={agent.busy}
                onClick={() => {
                  onCancel();
                  agent.recordOutcome("cancelled");
                }}
              >
                Bỏ thay đổi
              </button>
              <button
                className="primary"
                disabled={!previewReady || agent.busy}
                onClick={() =>
                  agent.recordOutcome(onApply() ? "applied" : "execution_error")
                }
              >
                Áp dụng
              </button>
            </div>
          </>
        )}
      </div>
      <div className="composer-wrap">
        {configured === false && (
          <button onClick={() => void checkConnection()}>
            Kiểm tra lại kết nối
          </button>
        )}
        <div className="connection">
          {configured === null
            ? "Đang kiểm tra kết nối…"
            : configured
              ? "DeepSeek · Đã cấu hình"
              : "DeepSeek · Chưa kết nối"}
        </div>
        {configured && !dailyLimitEnabled && <small className="quota-status">Thử nghiệm · Không giới hạn lượt/ngày</small>}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            aria-label="Yêu cầu hình học"
            placeholder={
              agent.pending
                ? "Bổ sung thông tin cho yêu cầu đang chờ…"
                : "Mô tả hình cần dựng hoặc chỉnh sửa…"
            }
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            disabled={!controller || suspended}
            maxLength={3000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div>
            <small>
              Tham chiếu:{" "}
              {controller?.selectedNames.map((name) => controller.objects.find((o) => o.name === name)?.displayName ?? name).join(", ") || "hình hiện tại"}
            </small>
            {agent.busy ? <button className="stop-response" type="button" onClick={agent.stop}>Dừng phản hồi</button> : <IconButton
              type="submit"
              icon="send"
              label="Gửi yêu cầu"
              className="primary"
              disabled={
                !configured ||
                !controller ||
                agent.busy ||
                suspended ||
                !request.trim()
              }
            />}
          </div>
        </form>
        <small>{preview ? "Bạn có thể hỏi thêm hoặc yêu cầu sửa bản xem trước." : "Hỏi tiếp theo hội thoại; thay đổi hình luôn có xem trước."}</small>
      </div>
    </aside>
  );
}
