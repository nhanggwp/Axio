import { useEffect, useRef, useState } from "react";
import {
  type AIReply,
  type GeometryObject,
  type PendingIntent,
} from "../../../shared/actions";
import type { GeometryController } from "../../geometry/GeometryController";
import { askAssistant, type Message } from "./client";
import { restoredChat, type ChatDraft } from "../../sessions/model";
function restored() {
  try {
    const journal = JSON.parse(sessionStorage.getItem("axio-working-draft") || "null");
    const value = journal?.chat ?? JSON.parse(sessionStorage.getItem("axio-agent-draft") || "null");
    return restoredChat({ messages: value?.messages ?? [], pending: value?.pending ?? null, composer: value?.composer ?? "" });
  } catch { return restoredChat(null); }
}
export function useAgentConversation(
  controller: GeometryController | undefined,
  configured: boolean | null,
  preview: AIReply | null,
  onPreview: (reply: AIReply) => Promise<void>,
  onClarification: (pending: boolean) => void,
  onCancelPreview: () => void,
  initialDraft?: ChatDraft,
  suspended = false,
  previewObjects?: GeometryObject[],
) {
  const [initial] = useState(() => initialDraft ?? restored()),
    [messages, setMessages] = useState<Message[]>(initial.messages),
    [pending, setPending] = useState<PendingIntent | null>(initial.pending),
    [busy, setBusy] = useState(false),
    [partial, setPartial] = useState(""),
    [phase, setPhase] = useState<"generating" | "validating" | "repairing" | "preview">("generating"),
    [error, setError] = useState("");
  const busyRef = useRef(false),
    abortRef = useRef<AbortController | null>(null),
    previewMessage = useRef<string | null>(null),
    validatingPreview = useRef(false),
    streamedText = useRef(""),
    lastSelection = useRef(""),
    submitRef = useRef<(text: string) => Promise<void>>(async () => {});
  useEffect(() => {
    onClarification(!!pending);
  }, [messages, pending, onClarification]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const updateOutcome = (id: string | null, outcome: Message["outcome"]) => {
    if (id) setMessages((v) => v.map((m) => m.id === id ? { ...m, outcome } : m));
  };
  const recordOutcome = (outcome: "applied" | "cancelled" | "execution_error") => {
    updateOutcome(previewMessage.current, outcome);
    previewMessage.current = null;
  };
  const stop = () => {
    if (!busyRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    if (validatingPreview.current) {
      onCancelPreview();
      recordOutcome("cancelled");
      validatingPreview.current = false;
    } else {
      const content = streamedText.current;
      setMessages((v) => [...v, {
        id: crypto.randomUUID(), role: "assistant", status: "interrupted",
        source: content ? "deepseek" : "validation",
        content: content || "Đã dừng phản hồi.",
      }]);
    }
    setPartial("");
    streamedText.current = "";
    busyRef.current = false;
    setBusy(false);
  };
  const cancel = () => {
    stop();
    setPending(null);
    lastSelection.current = "";
    setError("");
    setMessages((v) => [...v, {
      id: crypto.randomUUID(), role: "assistant", source: "validation",
      content: "Đã hủy yêu cầu đang chờ.",
    }]);
  };
  const submit = async (text: string) => {
    if (!controller || controller.loading || suspended || !text.trim() || busyRef.current || !configured) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setPartial("");
    streamedText.current = "";
    setPhase("generating");
    const abort = new AbortController();
    abortRef.current = abort;
    setMessages((v) => [...v, { id: crypto.randomUUID(), role: "user", content: text }]);
    let replyId: string | null = null;
    try {
      let history = messages;
      let feedback: { message: string; previous: AIReply } | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        const reply = await askAssistant(text, controller, history, pending, abort.signal, (event) => {
          if (abort.signal.aborted) return;
          if (event.type === "text") { setPartial(event.text); streamedText.current = event.text; }
          else setPhase(attempt && event.phase === "generating" ? "repairing" : event.phase);
        }, feedback, previewObjects);
        if (abort.signal.aborted) return;
        replyId = crypto.randomUUID();
        setPartial("");
        const entry: Message = {
          id: replyId, role: "assistant", content: reply.message,
          status: reply.status, source: reply.source, actions: reply.actions, checks: reply.checks,
          suggestions: reply.suggestions,
          ...(reply.status === "ready_to_preview" ? { outcome: "proposed" as const } : {}),
        };
        setMessages((v) => [...v, entry]);
        setPending(reply.pending);
        if (reply.status !== "ready_to_preview") break;
        if (preview) updateOutcome(previewMessage.current, "cancelled");
        previewMessage.current = replyId;
        setPhase("preview");
        validatingPreview.current = true;
        try {
          await onPreview(reply);
          if (!abort.signal.aborted) updateOutcome(replyId, "previewed");
          break;
        } catch (error) {
          if (abort.signal.aborted) return;
          updateOutcome(replyId, "execution_error");
          validatingPreview.current = false;
          previewMessage.current = null;
          if (!reply.checks.length || attempt === 2) throw error;
          const message = (error instanceof Error ? error.message : "Hình chưa thỏa ràng buộc.").slice(0, 4000);
          const validation: Message = { id: crypto.randomUUID(), role: "assistant", content: message, source: "validation", status: "execution_error" };
          setMessages((v) => [...v, validation]);
          history = [...history, { ...entry, outcome: "execution_error" }, validation];
          feedback = { message, previous: reply };
          setPhase("repairing");
          setPartial("");
          streamedText.current = "";
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        const message = e instanceof Error ? e.message : "Yêu cầu không thành công.";
        setError(message);
        setPartial("");
        if (replyId) updateOutcome(replyId, "execution_error");
        setMessages((v) => [...v, { id: crypto.randomUUID(), role: "assistant", content: message, source: "validation", status: "execution_error" }]);
      }
    } finally {
      if (abortRef.current === abort) {
        busyRef.current = false;
        validatingPreview.current = false;
        setBusy(false);
      }
    }
  };
  submitRef.current = submit;
  useEffect(() => {
    if (!controller || !pending?.selection_request || preview || suspended) return;
    const continueWithSelection = () => {
      if (busyRef.current || controller.loading) return;
      const selection = pending.selection_request!,
        matches = controller.selectedNames.filter((n) => selection.allowed_types.includes(controller.objects.find((o) => o.name === n)?.type ?? ""));
      const signature = `${pending.id}:${pending.step}:${matches.join(",")}`;
      if (matches.length < selection.min || matches.length > selection.max || signature === lastSelection.current) return;
      lastSelection.current = signature;
      void submitRef.current(`Đã chọn đối tượng: ${matches.join(", ")}. Tiếp tục yêu cầu đang chờ.`);
    };
    return controller.subscribe(continueWithSelection);
  }, [controller, pending, preview, suspended]);
  useEffect(() => {
    if (!controller) return;
    let document = controller.documentGeneration;
    return controller.subscribe(() => {
      if (controller.documentGeneration !== document) {
        document = controller.documentGeneration;
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = false;
        validatingPreview.current = false;
        previewMessage.current = null;
        setBusy(false);
        setPartial("");
        setMessages([]);
        setPending(null);
        setError("");
        lastSelection.current = "";
      }
    });
  }, [controller]);
  return { messages, pending, busy, partial, phase, error, setError, submit, cancel, stop, recordOutcome, initialComposer: initial.composer };
}
