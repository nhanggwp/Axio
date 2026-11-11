import { expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApplication } from "../../server/app";
for (const enabled of [false, true])
  it(`daily quota can be ${enabled ? "enabled" : "disabled for the trial"} even with historical usage`, async () => {
    const actualFetch = globalThis.fetch;
    const provider = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) =>
        String(input).startsWith("https://api.deepseek.com/")
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  choices: [
                    {
                      message: {
                        content: JSON.stringify({
                          status: "explanation",
                          message: "Trả lời thật từ luồng kiểm thử đơn vị.",
                          actions: [],
                        }),
                      },
                    },
                  ],
                }),
                { headers: { "Content-Type": "application/json" } },
              ),
            )
          : actualFetch(input, init),
      );
    const app = await createApplication({
      host: "127.0.0.1",
      port: 0,
      origin: "https://axio.test",
      production: true,
      databasePath: ":memory:",
      authSecret: "unit-test-only-secret-at-least-thirty-two-characters",
      smtpPort: 587,
      smtpSecure: false,
      mailFrom: "test@axio.test",
      deepseekKey: "unit-test-key",
      deepseekModel: "unit-test-model",
      guestDailyLimit: 1,
      userDailyLimit: 1,
      aiDailyLimitEnabled: enabled,
    });
    let server: Server | undefined;
    try {
      app.db
        .prepare("INSERT INTO ai_usage(subject,day,count) VALUES(?,?,?)")
        .run("guest:127.0.0.1", new Date().toISOString().slice(0, 10), 100);
      server = app.app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server!.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string")
        throw Error("No server address");
      const url = `http://127.0.0.1:${address.port}`;
      expect(
        (await (await actualFetch(url + "/api/status")).json())
          .dailyLimitEnabled,
      ).toBe(enabled);
      for (let i = 0; i < 2; i++) {
        const response = await actualFetch(url + "/api/assist", {
          method: "POST",
          headers: {
            Origin: "https://axio.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request: "Giải thích hình.",
            selection: null,
            objects: [],
            conversation: [],
          }),
        });
        expect(response.status).toBe(enabled ? 429 : 200);
        await response.text();
      }
      expect(app.db.prepare("SELECT count FROM ai_usage").get()).toEqual({
        count: 100,
      });
    } finally {
      if (server)
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      app.db.close();
      provider.mockRestore();
    }
  });
