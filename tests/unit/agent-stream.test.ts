import { afterEach, describe, expect, it, vi } from "vitest";
import { partialMessage, readEventStream } from "../../shared/eventStream";
import { requestSchema, replySchema, type AgentProgress } from "../../shared/actions";
import { runAgent } from "../../server/services/agent";
import { fixedRightTriangle } from "../helpers/fixedTriangle";
import { draggableTriangle } from "../helpers/draggableTriangle";
import type { ServerConfig } from "../../server/config";
const body = requestSchema.parse({ request: "Nó khác đường tròn kia thế nào?", selection: null, objects: [], conversation: [
  { role: "user", content: "Vẽ đường tròn nội tiếp." },
  { role: "assistant", content: "Đề xuất đường tròn ci.", actions: [{ type: "construct", kind: "incircle", label: "ci", refs: ["A", "B", "C"] }], outcome: "applied" },
] });
const config = { deepseekKey: "test-only-key", deepseekModel: "test-only-model" } as ServerConfig;
afterEach(() => vi.restoreAllMocks());
function provider(pieces: string[], done = true) {
  return new Response(pieces.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`).join("") + (done ? "data: [DONE]\r\n\r\n" : ""), { headers: { "Content-Type": "text/event-stream" } });
}
describe("streamed agent contract", () => {
  it("rejects hidden free direction points that lock vertices and repairs to draggable point_on controls", async () => {
    const emptyRequest = requestSchema.parse({ request: "Vẽ tam giác ABC vuông tại A, AB=9, AC=12, đường cao AH.", selection: null, objects: [], conversation: [] });
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(provider([JSON.stringify(fixedRightTriangle)]))
      .mockResolvedValueOnce(provider([JSON.stringify(draggableTriangle)]));
    const result = await runAgent(emptyRequest, config, { onProgress: () => {} });
    expect(result.actions).toEqual(draggableTriangle.actions);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repaired = JSON.parse(fetch.mock.calls[1][1]!.body as string);
    expect(JSON.parse(repaired.messages.at(-1).content).validation_feedback).toContain("point_on");
  });
  it("can correct a mistaken dependency check for deliberately free root points", async () => {
    const previous = replySchema.parse({ status: "ready_to_preview", message: "Đề xuất điểm tự do.", checks: [{ kind: "dependent", refs: ["P"] }], actions: [{ type: "point", label: "P", x: 1, y: 2 }] });
    const request = requestSchema.parse({ ...body, validation_feedback: { message: "P đang là đối tượng tự do.", previous } });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(provider([JSON.stringify({ ...previous, checks: [] })]));
    const result = await runAgent(request, config, { onProgress: () => {} });
    expect(result.checks).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cannot drop declared geometric requirements to make a repair appear valid", async () => {
    const previous = replySchema.parse({ status: "ready_to_preview", message: "Đề xuất.", checks: [{ kind: "on_segment", refs: ["S", "P", "Q"] }], actions: [{ type: "point", label: "S", x: 0, y: 0 }] });
    const request = requestSchema.parse({ ...body, validation_feedback: { message: "S không nằm trên PQ.", previous } });
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(provider([JSON.stringify({ ...previous, checks: [] })]))
      .mockResolvedValueOnce(provider([JSON.stringify(previous)]));
    const result = await runAgent(request, config, { onProgress: () => {} });
    expect(result.checks).toEqual(previous.checks);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repaired = JSON.parse(fetch.mock.calls[1][1]!.body as string);
    expect(JSON.parse(repaired.messages.at(-1).content).validation_feedback).toContain("bỏ hoặc thay đổi checks");
  });
  it("frames fragmented UTF-8, CRLF, comments and multiple data lines", async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\nevent: text\r\ndata: nội tiếp\r\ndata: ngoại tiếp\r\n\r\ndata: [DONE]\n\n');
    const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
    const entries = [];
    for await (const event of readEventStream(response)) entries.push(event);
    expect(entries).toEqual([{ event: "text", data: "nội tiếp\nngoại tiếp" }, { event: "message", data: "[DONE]" }]);
  });
  it("reads only a top-level message and preserves incomplete escape sequences", () => {
    expect(partialMessage('{"actions":[{"message":"nested"}],"message":"Nội tiếp \\u011')).toBe("Nội tiếp ");
    expect(partialMessage('{"actions":[{"message":"nested"}],"message":"Nội tiếp \\u0111úng\\n\\"rồi')).toBe('Nội tiếp đúng\n"rồi');
    expect(partialMessage('{"actions":[{"message":"nested"}]}')).toBeNull();
    expect(partialMessage('{"other":"message: \\\"fake\\\"", "message":"Thật"}')).toBe("Thật");
  });
  it("streams real provider deltas and sends role history with action outcomes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(provider(['{"message":"Nội', ' tiếp tiếp xúc ba cạnh.","status":"explanation","actions":[]}']));
    const progress: AgentProgress[] = [];
    const result = await runAgent(body, config, { onProgress: (event) => progress.push(event) });
    expect(result.status).toBe("explanation");
    expect(progress.filter((e) => e.type === "text")).toEqual([{ type: "text", text: "Nội" }, { type: "text", text: "Nội tiếp tiếp xúc ba cạnh." }]);
    const sent = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(sent.stream).toBe(true);
    expect(sent.thinking).toEqual({ type: "enabled" });
    expect(sent.reasoning_effort).toBe("low");
    expect(sent.max_tokens).toBeGreaterThan(5000);
    expect(sent.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(JSON.parse(sent.messages[2].content)).toMatchObject({ outcome: "applied", actions: [{ kind: "incircle", label: "ci" }] });
  });
  it("never returns an executable reply for truncated or invalid streamed actions", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(provider(['{"message":"Đề xuất đường tròn",'], false));
    await expect(runAgent(body, config, { onProgress: () => {} })).rejects.toThrow("bị ngắt");
    fetch.mockImplementation(async () => provider(['{"message":"Đề xuất", "status":"ready_to_preview", "actions":[{"type":"javascript","code":"alert(1)"}]}']));
    await expect(runAgent(body, config, { onProgress: () => {} })).rejects.toThrow("không hợp lệ");
  });
  it("repairs an invalid schema once using concrete validation feedback", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(provider(['{"status":"explanation","message":"Giải thích.","actions":[],"outcome":"applied"}']))
      .mockResolvedValueOnce(provider(['{"status":"explanation","message":"Nội tiếp tiếp xúc ba cạnh.","actions":[]}']));
    const progress: AgentProgress[] = [];
    const result = await runAgent(body, config, { onProgress: (event) => progress.push(event) });
    expect(result.status).toBe("explanation");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(progress).toContainEqual({ type: "phase", phase: "repairing" });
    const repaired = JSON.parse(fetch.mock.calls[1][1]!.body as string);
    expect(JSON.parse(repaired.messages.at(-1).content).validation_feedback).toBeInstanceOf(Array);
    expect(repaired.messages.at(-3).content).toContain(body.request);
  });
});
