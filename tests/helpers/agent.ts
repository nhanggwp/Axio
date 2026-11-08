import type { Page } from "@playwright/test";
import { AGENT_TIMEOUT_MS, replySchema } from "../../shared/actions";
import { readEventStream } from "../../shared/eventStream";
type ObservedWindow = typeof window & { agentStreams: string[] };
/** Observe a clone of the real network stream; Chrome CDP discards canceled SSE bodies. */
export async function observeAgent(page: Page) {
  await page.evaluate(() => {
    const state = window as ObservedWindow;
    state.agentStreams = [];
    const actual = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await actual(...args);
      if (String(args[0]) === "/api/assist") {
        void response.clone().text().then((text) => state.agentStreams.push(text));
      }
      return response;
    };
  });
}
export async function agentReply(page: Page, index: number) {
  await page.waitForFunction((i) => (window as ObservedWindow).agentStreams.length > i, index, { timeout: AGENT_TIMEOUT_MS + 10000 });
  const text = await page.evaluate((i) => (window as ObservedWindow).agentStreams[i], index);
  let reply: unknown, chunks = 0;
  for await (const event of readEventStream(new Response(text))) {
    const data = JSON.parse(event.data);
    if (data.type === "reply") reply = data.reply;
    if (data.type === "text") chunks++;
    if (data.type === "error") throw new Error(data.message);
  }
  return { plan: replySchema.parse(reply), chunks };
}
/** One user turn may include bounded automatic repairs before a usable preview. */
export async function completedAgentReply(page: Page, firstStream: number) {
  await agentReply(page, firstStream);
  await page.locator(".processing").waitFor({ state: "hidden", timeout: AGENT_TIMEOUT_MS * 3 + 10000 });
  const nextIndex = await page.evaluate(() => (window as ObservedWindow).agentStreams.length);
  return { ...await agentReply(page, nextIndex - 1), nextIndex };
}
