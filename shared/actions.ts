import { z } from "zod";
export const AGENT_TIMEOUT_MS = 120_000;
export const labelSchema = z.string().max(24).regex(/^[A-Za-z][A-Za-z0-9_]*'{0,3}$/);
export const geometryCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("on_segment"), refs: z.tuple([labelSchema, labelSchema, labelSchema]) }).strict(),
  z.object({ kind: z.literal("equal_distance"), refs: z.tuple([labelSchema, labelSchema, labelSchema, labelSchema]) }).strict(),
  z.object({ kind: z.literal("reflection"), refs: z.tuple([labelSchema, labelSchema, labelSchema]) }).strict(),
  z.object({ kind: z.literal("on_circle"), refs: z.tuple([labelSchema, labelSchema]) }).strict(),
  z.object({ kind: z.literal("perpendicular"), refs: z.tuple([labelSchema, labelSchema]) }).strict(),
  z.object({ kind: z.literal("coordinate_order"), refs: z.tuple([labelSchema, labelSchema]), axis: z.enum(["x", "y"]) }).strict(),
  z.object({ kind: z.literal("distance"), refs: z.tuple([labelSchema, labelSchema]), value: z.number().finite().positive().max(100000) }).strict(),
  z.object({ kind: z.literal("moveable"), refs: z.array(labelSchema).min(1).max(12) }).strict(),
  z.object({ kind: z.literal("dependent"), refs: z.array(labelSchema).min(1).max(12) }).strict(),
]);
export type GeometryCheck = z.infer<typeof geometryCheckSchema>;
const n = z.number().finite().min(-100000).max(100000);
export const actionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("point"), label: labelSchema, x: n, y: n, auxiliary: z.boolean().optional() })
    .strict(),
  z
    .object({
      type: z.literal("construct"),
      label: labelSchema,
      auxiliary: z.boolean().optional(),
      position: z.object({ x: n, y: n }).strict().optional(),
      kind: z.enum([
        "point_on",
        "segment",
        "line",
        "ray",
        "polygon",
        "regular_polygon",
        "circle",
        "circle_radius",
        "circumcircle",
        "incircle",
        "incenter",
        "circumcenter",
        "centroid",
        "orthocenter",
        "center",
        "midpoint",
        "intersection",
        "perpendicular",
        "parallel",
        "perpendicular_bisector",
        "angle_bisector",
        "angle",
        "distance",
        "length",
        "area",
        "reflect",
        "translate",
        "rotate",
        "dilate",
        "vector",
      ]),
      refs: z.array(labelSchema).min(1).max(12),
      value: n.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("altitude"),
      vertex: labelSchema,
      base: labelSchema,
      foot: labelSchema,
      label: labelSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("style"),
      target: labelSchema,
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      visible: z.boolean().optional(),
      thickness: z.number().int().min(1).max(13).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("move"), target: labelSchema, x: n, y: n })
    .strict(),
  z.object({ type: z.literal("delete"), target: labelSchema }).strict(),
]);
export const selectionRequestSchema = z
  .object({
    allowed_types: z.array(z.string().max(40)).min(1).max(12),
    min: z.number().int().min(1).max(10),
    max: z.number().int().min(1).max(10),
  })
  .strict()
  .refine((v) => v.min <= v.max);
export const pendingIntentSchema = z
  .object({
    id: z.string().max(80),
    original_request: z.string().max(3000),
    intent: z.string().max(100),
    resolved: z
      .record(z.string().max(50), z.string().max(150))
      .refine((v) => Object.keys(v).length <= 12),
    missing_parameters: z.array(z.string().max(60)).max(10),
    step: z.number().int().min(0).max(5),
    selection_request: selectionRequestSchema.nullable(),
  })
  .strict();
export const replySchema = z
  .object({
    status: z.enum([
      "needs_clarification",
      "ready_to_preview",
      "explanation",
      "impossible",
      "execution_error",
    ]),
    intent_relation: z.enum(["continue", "replace", "aside"]).default("continue"),
    message: z.string().min(1).max(4000),
    suggestions: z.array(z.string().trim().min(1).max(160)).max(3).default([]),
    missing_parameters: z.array(z.string().max(60)).max(10).default([]),
    selection_request: selectionRequestSchema.nullable().default(null),
    pending: pendingIntentSchema.nullable().default(null),
    source: z.enum(["deepseek", "validation"]).default("deepseek"),
    checks: z.array(geometryCheckSchema).max(32).default([]),
    actions: z.array(actionSchema).max(32),
  })
  .strict()
  .refine(
    (v) =>
      v.status === "ready_to_preview"
        ? v.actions.length > 0 && v.missing_parameters.length === 0
        : v.actions.length === 0,
    "Chỉ kế hoạch đủ thông tin mới được chứa thao tác dựng hình.",
  );
export type GeometryAction = z.infer<typeof actionSchema>;
export type AIReply = z.infer<typeof replySchema>;
export type PendingIntent = z.infer<typeof pendingIntentSchema>;
export const conversationEntrySchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
  status: z.string().max(40).optional(),
  source: z.enum(["deepseek", "validation"]).optional(),
  actions: z.array(actionSchema).max(32).optional(),
  checks: z.array(geometryCheckSchema).max(32).optional(),
  outcome: z.enum(["proposed", "previewed", "applied", "cancelled", "execution_error"]).optional(),
});
export type ConversationEntry = z.infer<typeof conversationEntrySchema>;
export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("phase"), phase: z.enum(["generating", "validating", "repairing"]) }),
  z.object({ type: z.literal("text"), text: z.string().max(4000) }),
  z.object({ type: z.literal("reply"), reply: replySchema }),
  z.object({ type: z.literal("error"), message: z.string().max(4000) }),
]);
export type AgentProgress = Extract<z.infer<typeof agentEventSchema>, { type: "phase" | "text" }>;
export const objectSchema = z.object({
  name: z.string().max(64),
  displayName: z.string().max(128).optional(),
  type: z.string().max(40),
  value: z.string().max(500),
  definition: z.string().max(1000),
  independent: z.boolean(),
  moveable: z.boolean(),
  visible: z.boolean(),
  auxiliary: z.boolean().optional(),
  color: z.string().max(20),
  labelVisible: z.boolean().optional(),
  thickness: z.number().optional(),
  lineStyle: z.number().optional(),
  vertices: z.array(z.string().max(64)).length(3).optional(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
});
export type GeometryObject = z.infer<typeof objectSchema>;
export const requestSchema = z
  .object({
    request: z.string().trim().min(1).max(3000),
    selection: z.string().max(64).nullable(),
    selections: z.array(z.string().max(64)).max(400).default([]),
    pending: pendingIntentSchema.nullable().default(null),
    validation_feedback: z.object({ message: z.string().min(1).max(4000), previous: replySchema }).strict().optional(),
    objects: z.array(objectSchema).max(400),
    preview_objects: z.array(objectSchema).max(400).optional(),
    conversation: z
      .array(conversationEntrySchema)
      .max(12),
  })
  .strict();
