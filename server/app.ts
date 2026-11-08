import express from "express";
import { rateLimit } from "express-rate-limit";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import path from "node:path";
import { requestSchema, type AgentProgress, type AIReply } from "../shared/actions";
import type { ServerConfig } from "./config";
import { openDatabase, migrateWorkspace } from "./db/database";
import { createAuth, migrateAuth } from "./auth/auth";
import { createMailer } from "./auth/email";
import { documentsRouter } from "./routes/documents";
import { runAgent } from "./services/agent";
import { trustedAppOrigins } from "./origins";
export async function createApplication(config: ServerConfig) {
  const allowedOrigins = trustedAppOrigins(config);
  const db = openDatabase(config.databasePath),
    mailer = createMailer(config),
    auth = createAuth(db, config, mailer);
  await migrateAuth(auth);
  migrateWorkspace(db);
  await (await auth.$context).checkSchema?.();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ?? false);
  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        code: "ORIGIN_NOT_ALLOWED",
        error: config.production ? "Nguồn yêu cầu không được phép." : `Địa chỉ truy cập chưa khớp với máy chủ. Hãy mở Axio tại ${config.origin}.`,
      });
      return;
    }
    if (
      config.production &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("sec-fetch-site") === "cross-site"
    ) {
      res.status(403).json({ error: "Nguồn yêu cầu không được phép." });
      return;
    }
    next();
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      configured: !!config.deepseekKey,
      model: config.deepseekModel,
      emailConfigured: mailer.configured,
      allowedOrigins,
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60000,
      limit: Math.max(40, config.authRequestLimit ?? 30),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Quá nhiều yêu cầu tài khoản. Vui lòng đợi một phút." },
    }),
  );
  app.use("/api/auth", (req, res, next) => {
    if (
      !mailer.configured &&
      [
        "/sign-up/email",
        "/request-password-reset",
        "/send-verification-email",
      ].some((p) => req.path === p)
    ) {
      res.status(503).json({
        code: "EMAIL_NOT_CONFIGURED",
        message:
          "Máy chủ chưa cấu hình gửi email. Bạn vẫn có thể tiếp tục dựng hình ở chế độ khách.",
      });
      return;
    }
    next();
  });
  app.all("/api/auth/*splat", toNodeHandler(auth));
  app.use(express.json({ limit: "22mb" }));
  app.use("/api/documents", documentsRouter(db, auth));
  app.post(
    "/api/assist",
    rateLimit({
      windowMs: 60000,
      limit: config.aiRequestLimit ?? 12,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Bạn gửi quá nhanh. Vui lòng đợi một phút." },
    }),
    async (req, res) => {
      const body = requestSchema.safeParse(req.body);
      if (!body.success) {
        res
          .status(400)
          .json({ error: "Yêu cầu hoặc dữ liệu hình học không hợp lệ." });
        return;
      }
      if (!config.deepseekKey) {
        res.status(503).json({
          error:
            "Chưa kết nối DeepSeek. Cấu hình DEEPSEEK_API_KEY trên máy chủ.",
        });
        return;
      }
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      const subject = session?.user.emailVerified
        ? `user:${session.user.id}`
        : `guest:${req.ip}`;
      const day = new Date().toISOString().slice(0, 10),
        limit = subject.startsWith("user:")
          ? config.userDailyLimit
          : config.guestDailyLimit;
      const allowed = db.transaction(() => {
        const row = db
          .prepare("SELECT count FROM ai_usage WHERE subject=? AND day=?")
          .get(subject, day) as { count: number } | undefined;
        if ((row?.count ?? 0) >= limit) return false;
        db.prepare(
          "INSERT INTO ai_usage(subject,day,count) VALUES(?,?,1) ON CONFLICT(subject,day) DO UPDATE SET count=count+1",
        ).run(subject, day);
        return true;
      })();
      if (!allowed) {
        res.status(429).json({
          error:
            "Bạn đã dùng hết lượt trợ lý hôm nay. Vui lòng thử lại vào ngày mai.",
        });
        return;
      }
      const streaming = req.get("accept")?.includes("text/event-stream");
      const abort = new AbortController();
      const disconnected = () => { if (!res.writableEnded) abort.abort(); };
      res.on("close", disconnected);
      const emit = (event: AgentProgress | { type: "reply"; reply: AIReply } | { type: "error"; message: string }) => {
        if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      if (streaming) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
      }
      try {
        const reply = await runAgent(body.data, config, { signal: abort.signal, onProgress: streaming ? emit : undefined });
        if (streaming) { emit({ type: "reply", reply }); res.end(); }
        else res.json(reply);
      } catch (e) {
        if (abort.signal.aborted) return;
        const error =
            e instanceof Error && e.name === "TimeoutError"
              ? "DeepSeek phản hồi quá lâu. Vui lòng thử lại."
              : e instanceof Error
                ? e.message
                : "Không thể nhận phản hồi từ DeepSeek.";
        if (streaming) { emit({ type: "error", message: error }); res.end(); }
        else res.status(502).json({ error });
      } finally {
        res.off("close", disconnected);
      }
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Không tìm thấy API." }),
  );
  app.use((req, res, next) => {
    // Opening the API URL in dev must not load a stale dist app on a blocked origin.
    if (!config.production && ["GET", "HEAD"].includes(req.method) && req.get("accept")?.includes("text/html")) {
      const address = `${req.protocol}://${req.get("host")}`;
      if (!allowedOrigins.includes(address)) {
        const target = new URL(config.origin);
        const requested = new URL(req.originalUrl, config.origin);
        target.pathname = requested.pathname;
        target.search = requested.search;
        res.redirect(307, target.href);
        return;
      }
    }
    next();
  });
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(400).json({ error: "Dữ liệu yêu cầu không hợp lệ." }),
  );
  return { app, db, auth };
}
