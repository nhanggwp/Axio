import {
  AGENT_TIMEOUT_MS,
  replySchema,
  type AIReply,
  type GeometryObject,
  type PendingIntent,
  type ConversationEntry,
  type AgentProgress,
  agentEventSchema,
  conversationEntrySchema,
} from "../../../shared/actions";
import { readEventStream } from "../../../shared/eventStream";
import type { GeometryController } from "../../geometry/GeometryController";
export type Message = ConversationEntry & {
  id?: string;
  suggestions?: string[];
};
export async function askAssistant(
  request: string,
  controller: GeometryController,
  conversation: Message[],
  pending: PendingIntent | null,
  signal?: AbortSignal,
  onProgress?: (event: AgentProgress) => void,
  validationFeedback?: { message: string; previous: AIReply },
  previewObjects?: GeometryObject[],
): Promise<AIReply> {
  controller.captureHistory();
  const response = await fetch("/api/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      request,
      selection: controller.selection,
      selections: controller.selectedNames,
      objects: controller.adapter.objects(),
      view: {axes:controller.adapter.viewState().axes,grid:controller.adapter.viewState().grid},
      history: { canUndo: controller.history.canUndo, canRedo: controller.history.canRedo },
      ...(previewObjects?.length ? { preview_objects: previewObjects } : {}),
      conversation: conversation
        .slice(-12)
        .map((message) => conversationEntrySchema.parse(message)),
      pending,
      ...(validationFeedback ? { validation_feedback: validationFeedback } : {}),
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(AGENT_TIMEOUT_MS + 5000)])
      : AbortSignal.timeout(AGENT_TIMEOUT_MS + 5000),
  });
  if (!response.ok) {
    const json = await response.json();
    throw new Error(json.error || "Không thể kết nối trợ lý.");
  }
  if (!response.headers.get("Content-Type")?.includes("text/event-stream"))
    return replySchema.parse(await response.json());
  for await (const event of readEventStream(response)) {
    const data = agentEventSchema.parse(JSON.parse(event.data));
    if (data.type === "error") throw new Error(data.message);
    if (data.type === "reply") return data.reply;
    onProgress?.(data);
  }
  throw new Error("Phản hồi bị ngắt trước khi hoàn tất. Hãy thử lại.");
}
