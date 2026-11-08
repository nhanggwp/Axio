/** Test-only real SMTP capture server. Never imported by production code. */
import { SMTPServer } from "smtp-server";
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../server/config";
import { createApplication } from "../server/app";
const folder = path.resolve("test-results/server");
mkdirSync(folder, { recursive: true });
const file = path.join(folder, "test.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  rmSync(file + suffix, { force: true });
const mail: { to: string[]; text: string }[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  onData(stream, session, callback) {
    let raw = "";
    stream.on("data", (chunk) => {
      raw += chunk.toString();
    });
    stream.on("end", () => {
      mail.push({
        to: session.envelope.rcptTo.map((r) => r.address),
        text: raw
          .replace(/=\r?\n/g, "")
          .replace(/=([0-9A-F]{2})/gi, (_, code: string) =>
            String.fromCharCode(parseInt(code, 16)),
          ),
      });
      callback();
    });
  },
});
await new Promise<void>((resolve) => smtp.listen(2527, "127.0.0.1", resolve));
const mailbox = createHttpServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify(
      mail.filter(
        (m) =>
          !url.searchParams.get("to") ||
          m.to.includes(url.searchParams.get("to")!),
      ),
    ),
  );
}).listen(3006, "127.0.0.1");
const config = {
  ...loadConfig(),
  port: 3005,
  origin: "http://127.0.0.1:5175",
  databasePath: file,
  authSecret: "test-only-auth-secret-longer-than-thirty-two-characters",
  production: false,
  smtpHost: "127.0.0.1",
  smtpPort: 2527,
  smtpSecure: false,
  smtpUser: undefined,
  smtpPassword: undefined,
  mailFrom: "Axio Tests <no-reply@axio.test>",
  guestDailyLimit: 500,
  userDailyLimit: 500,
  aiRequestLimit: 100,
  authRequestLimit: 300,
  authSignInLimit: 100,
};
const { app, db } = await createApplication(config);
const server = app.listen(3005, "127.0.0.1");
const vite = await createViteServer({
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3005", changeOrigin: false } },
  },
});
await vite.listen();
console.log("Axio test server ready: http://127.0.0.1:5175");
async function close() {
  await vite.close();
  server.close();
  mailbox.close();
  smtp.close();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
