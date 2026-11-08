import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import { createApplication } from "../../server/app";
import type { ServerConfig } from "../../server/config";
let application: Awaited<ReturnType<typeof createApplication>>,
  server: Server,
  url: string;
beforeAll(async () => {
  const config: ServerConfig = {
    port: 0,
    host: "127.0.0.1",
    origin: "https://axio.test",
    databasePath: ":memory:",
    authSecret: randomBytes(48).toString("base64url"),
    production: true,
    smtpPort: 587,
    smtpSecure: false,
    mailFrom: "Axio <no-reply@axio.test>",
    deepseekModel: "deepseek-flash",
    guestDailyLimit: 20,
    userDailyLimit: 100,
  };
  application = await createApplication(config);
  server = application.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  url = "http://127.0.0.1:" + (typeof address === "object" ? address!.port : 0);
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  application.db.close();
});
describe("server boundaries without mocked authentication", () => {
  it("rejects protected documents for guests", async () =>
    expect((await fetch(url + "/api/documents")).status).toBe(401));
  it("reports unavailable email instead of inventing successful registration", async () => {
    const response = await fetch(url + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://axio.test",
      },
      body: JSON.stringify({
        name: "Khách",
        email: "guest@axio.test",
        password: "Not-A-Real-User-123!",
      }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("EMAIL_NOT_CONFIGURED");
    expect(
      application.db.prepare("SELECT count(*) AS count FROM user").get(),
    ).toEqual({ count: 0 });
  });
  it("rejects foreign origins and cross-site mutations", async () => {
    expect(
      (
        await fetch(url + "/api/auth/sign-out", {
          method: "POST",
          headers: { Origin: "https://other.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(url + "/api/documents", {
          method: "POST",
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
    ).toBe(403);
  });
  it("allows cross-site top-level GET navigation needed by email links", async () => {
    const response = await fetch(url + "/api/status", {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("does not claim AI availability without a key", async () => {
    const response = await fetch(url + "/api/assist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://axio.test",
      },
      body: JSON.stringify({
        request: "Vẽ một điểm.",
        selection: null,
        objects: [],
        conversation: [],
      }),
    });
    expect(response.status).toBe(503);
  });
});
