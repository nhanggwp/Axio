import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApplication } from "../../server/app";
import { trustedAppOrigins } from "../../server/origins";
let app: Awaited<ReturnType<typeof createApplication>>, server: Server, base: string;
const origin = "http://127.0.0.1:5173";
beforeAll(async () => {
  app = await createApplication({ port: 0, host: "127.0.0.1", origin, databasePath: ":memory:", authSecret: "origin-tests-only-secret-at-least-thirty-two-characters", production: false, smtpPort: 587, smtpSecure: false, mailFrom: "test@axio.test", deepseekModel: "test-model", guestDailyLimit: 20, userDailyLimit: 100 });
  server = app.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); app.db.close(); });
describe("trusted application origins", () => {
  it("permits only exact loopback aliases on the configured dev scheme and port", async () => {
    for (const alias of trustedAppOrigins({ origin, production: false })) {
      const api = await fetch(base + "/api/assist", { method: "POST", headers: { Origin: alias, "Content-Type": "application/json" }, body: "{}" });
      expect(api.status).toBe(400); // Reached request validation, not an origin rejection.
      const auth = await fetch(base + "/api/auth/sign-out", { method: "POST", headers: { Origin: alias, "Content-Type": "application/json" }, body: "{}" });
      expect(auth.status).toBe(200);
    }
    for (const other of ["http://localhost:5174", "https://localhost:5173", "http://127.0.0.1.evil.test:5173", "null"]) {
      const denied = await fetch(base + "/api/assist", { method: "POST", headers: { Origin: other } });
      expect(denied.status).toBe(403);
      expect((await denied.json()).code).toBe("ORIGIN_NOT_ALLOWED");
    }
  });
  it("keeps production and non-loopback origins exact", () => {
    expect(trustedAppOrigins({ origin: "https://localhost:5173", production: true })).toEqual(["https://localhost:5173"]);
    expect(trustedAppOrigins({ origin: "https://axio.test", production: false })).toEqual(["https://axio.test"]);
  });
  it("redirects API-port HTML navigation to the frontend and exposes readiness origins", async () => {
    const response = await fetch(base + "/?auth=verified", { headers: { Accept: "text/html" }, redirect: "manual" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(origin + "/?auth=verified");
    const status = await fetch(base + "/api/status").then((r) => r.json());
    expect(status.allowedOrigins).toContain("http://localhost:5173");
    const unusualPath = await fetch(base + "/%5C%5Cexternal.test/", { headers: { Accept: "text/html" }, redirect: "manual" });
    expect(new URL(unusualPath.headers.get("location")!).origin).toBe(origin);
  });
});
