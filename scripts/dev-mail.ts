/** Local development mailbox. Not mounted in the application or production. */
import { SMTPServer } from "smtp-server";
import { createServer } from "node:http";
if (process.env.NODE_ENV === "production")
  throw new Error("Hộp thư cục bộ chỉ dùng trong phát triển.");
const messages: { to: string[]; received: string; text: string }[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  size: 5_000_000,
  onData(stream, session, callback) {
    let raw = "";
    stream.on("data", (chunk) => {
      raw += chunk.toString();
    });
    stream.on("end", () => {
      messages.unshift({
        to: session.envelope.rcptTo.map((r) => r.address),
        received: new Date().toLocaleString("vi-VN"),
        text: raw
          .replace(/=\r?\n/g, "")
          .replace(/=([0-9A-F]{2})/gi, (_, n: string) =>
            String.fromCharCode(parseInt(n, 16)),
          ),
      });
      messages.splice(50);
      callback();
    });
  },
});
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const web = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'",
  );
  if (req.url === "/messages") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(messages));
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Hộp thư phát triển Axio</title><style>body{font-family:system-ui;background:#ebf2f2;color:#23232d;max-width:900px;margin:32px auto;padding:16px}article{border:1px solid #23232d1f;border-radius:6px;padding:16px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#4f18e9}</style><h1>Hộp thư phát triển Axio</h1><p>Chỉ nhận email SMTP cục bộ trên thiết bị này. Email không được chuyển ra Internet. Tải lại trang để xem thư mới; sao chép liên kết xác minh hoặc đặt lại mật khẩu trong thư.</p>${messages.map((m) => `<article><b>${escape(m.to.join(", "))}</b> · ${escape(m.received)}<pre>${escape(m.text)}</pre></article>`).join("") || "<p>Chưa có thư.</p>"}</html>`,
  );
});
smtp.listen(2525, "127.0.0.1", () =>
  console.log("SMTP phát triển: 127.0.0.1:2525"),
);
web.listen(8025, "127.0.0.1", () =>
  console.log("Hộp thư: http://127.0.0.1:8025"),
);
function close() {
  smtp.close();
  web.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
