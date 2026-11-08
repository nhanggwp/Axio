import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApplication } from "../../server/app";
import { readEventStream } from "../../shared/eventStream";
let application: Awaited<ReturnType<typeof createApplication>>, server: Server, url: string;
const actualFetch = globalThis.fetch;
beforeAll(async () => {
  application = await createApplication({ port: 0, host: "127.0.0.1", origin: "http://axio.test", databasePath: ":memory:", authSecret: "test-only-secret-for-isolated-stream-transport", production: false, smtpPort: 587, smtpSecure: false, mailFrom: "test@axio.test", deepseekKey: "test-only-provider-key", deepseekModel: "test-only-model", guestDailyLimit: 100, userDailyLimit: 100 });
  server = application.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}/api/assist`;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); application.db.close(); });
const headers = { Accept: "text/event-stream", "Content-Type": "application/json", Origin: "http://axio.test" };
const body = JSON.stringify({ request: "Giải thích nội tiếp.", selection: null, objects: [], conversation: [] });
it("delivers partial SSE over HTTP and cancels the upstream request when the client stops", async () => {
  let upstreamSignal: AbortSignal | null | undefined;
  let upstreamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    upstreamSignal = init?.signal;
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      upstreamController = controller;
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"message":"Nội tiếp' } }] })}\n\n`));
    } });
    return new Response(stream);
  });
  const abort = new AbortController();
  const response = await actualFetch(url, { method: "POST", headers, body, signal: abort.signal });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const events = readEventStream(response);
  expect((await events.next()).value).toMatchObject({ data: JSON.stringify({ type: "phase", phase: "generating" }) });
  expect((await events.next()).value).toMatchObject({ data: JSON.stringify({ type: "text", text: "Nội tiếp" }) });
  abort.abort();
  await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true));
  upstreamController?.close();
  await events.return();
});
it("stream validation errors are explicit events with no final executable reply", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response('data: {"choices":[{"delta":{"content":"{}"}}]}\n\ndata: [DONE]\n\n'));
  const response = await actualFetch(url, { method: "POST", headers, body });
  const events = [];
  for await (const event of readEventStream(response)) events.push(JSON.parse(event.data));
  expect(events.some((e) => e.type === "error" && e.message.includes("không hợp lệ"))).toBe(true);
  expect(events.some((e) => e.type === "reply")).toBe(false);
});
