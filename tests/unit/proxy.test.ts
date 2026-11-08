import { expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApplication } from "../../server/app";

for (const trustProxy of [0, 1] as const) it(`guest usage respects a configured proxy hop and ignores untrusted forwarding (${trustProxy})`, async () => {
  const actualFetch = globalThis.fetch;
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).startsWith("https://api.deepseek.com/")) return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status: "explanation", message: "Giải thích kiểm thử.", actions: [] }) } }] }), { headers: { "Content-Type": "application/json" } }));
    return actualFetch(input, init);
  });
  const application = await createApplication({
    host: "127.0.0.1", port: 0, origin: "https://axio.test", production: true, trustProxy,
    databasePath: ":memory:", authSecret: "proxy-test-only-secret-at-least-thirty-two-characters",
    smtpPort: 587, smtpSecure: false, mailFrom: "test@axio.test", deepseekKey: "test-only-key", deepseekModel: "test-only-model",
    guestDailyLimit: 20, userDailyLimit: 100,
  });
  let server: Server | undefined;
  try {
    server = application.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    for (const ip of ["192.0.2.1", "192.0.2.2"]) {
      const response = await actualFetch(`http://127.0.0.1:${address.port}/api/assist`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: "https://axio.test", "X-Forwarded-For": ip },
        body: JSON.stringify({ request: "Giải thích quan hệ.", selection: null, objects: [], conversation: [] }),
      });
      expect(response.status).toBe(200);
    }
    const rows = application.db.prepare("SELECT subject,count FROM ai_usage ORDER BY subject").all();
    if (trustProxy) expect(rows).toEqual([{ subject: "guest:192.0.2.1", count: 1 }, { subject: "guest:192.0.2.2", count: 1 }]);
    else {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ subject: "guest:127.0.0.1", count: 2 });
    }
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    application.db.close();
    provider.mockRestore();
  }
});
