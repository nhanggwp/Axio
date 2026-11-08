import { z } from "zod";
import { conversationEntrySchema, pendingIntentSchema } from "../../shared/actions";
const messageSchema = conversationEntrySchema.extend({
  id: z.string().max(80).optional(),
  suggestions: z.array(z.string().max(160)).max(3).optional(),
});
export const chatDraftSchema = z.object({
  messages: z.array(messageSchema),
  pending: pendingIntentSchema.nullable(),
  composer: z.string().max(3000).default(""),
});
export type ChatDraft = z.infer<typeof chatDraftSchema>;
export const emptyChat = (): ChatDraft => ({ messages: [], pending: null, composer: "" });
export type ChatBridge = { capture: () => ChatDraft; busy: boolean };
const documentSchema = z.object({ id: z.string(), title: z.string().max(100), version: z.number().int().positive(), updatedAt: z.string(), createdAt: z.string().optional() });
export const sessionMetaSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(80), version: z.number().int().nonnegative(),
  createdAt: z.string(), updatedAt: z.string(), objectCount: z.number().int().nonnegative(), messageCount: z.number().int().nonnegative(),
});
export const sessionRecordSchema = sessionMetaSchema.extend({
  data: z.string().max(20_000_000).regex(/^UEs[A-Za-z0-9+/=\r\n]+$/),
  documentTitle: z.string().max(100), savedKey: z.string().max(20_000_000), chat: chatDraftSchema,
  binding: z.object({ ownerId: z.string(), document: documentSchema }).nullable(),
});
export type SessionMeta = z.infer<typeof sessionMetaSchema>;
export type SessionRecord = z.infer<typeof sessionRecordSchema>;
export const journalSchema = sessionRecordSchema.pick({ savedKey: true, chat: true, binding: true, updatedAt: true }).extend({ sessionId: z.string().uuid(), baseVersion: z.number().int().nonnegative(), xml: z.string().max(20_000_000), title: z.string().max(100) });
export function sessionMeta(record: SessionRecord): SessionMeta {
  return sessionMetaSchema.parse(record);
}
export function restoredChat(input: unknown): ChatDraft {
  const parsed = chatDraftSchema.safeParse(input);
  if (!parsed.success) return emptyChat();
  return { ...parsed.data, messages: parsed.data.messages.map((m) => ({ ...m, id: m.id ?? crypto.randomUUID(), ...(m.outcome === "proposed" || m.outcome === "previewed" ? { outcome: "cancelled" as const } : {}) })) };
}
