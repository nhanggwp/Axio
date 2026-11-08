import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { createAuth } from "../auth/auth";
const title = z.string().trim().min(1).max(100);
const documentData = z
  .string()
  .max(20_000_000)
  .regex(/^UEs[A-Za-z0-9+/=\r\n]+$/);
export function documentsRouter(
  db: Database.Database,
  auth: ReturnType<typeof createAuth>,
) {
  const router = Router();
  router.use(async (req, res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user.emailVerified) {
      res
        .status(401)
        .json({ error: "Bạn cần đăng nhập bằng tài khoản đã xác minh email." });
      return;
    }
    res.locals.userId = session.user.id;
    next();
  });
  router.get("/", (_req, res) => {
    const docs = db
      .prepare(
        "SELECT id,title,version,created_at AS createdAt,updated_at AS updatedAt FROM documents WHERE user_id=? ORDER BY updated_at DESC",
      )
      .all(res.locals.userId);
    res.json({ documents: docs });
  });
  router.post("/", (req, res) => {
    const parsed = z
      .object({ title, data: documentData })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Tên hoặc nội dung tài liệu không hợp lệ." });
      return;
    }
    const count = db
      .prepare("SELECT count(*) AS count FROM documents WHERE user_id=?")
      .get(res.locals.userId) as { count: number };
    if (count.count >= 200) {
      res.status(409).json({ error: "Tối đa 200 tài liệu mỗi tài khoản." });
      return;
    }
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO documents(id,user_id,title,data,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    ).run(id, res.locals.userId, parsed.data.title, parsed.data.data, now, now);
    res
      .status(201)
      .json({
        id,
        title: parsed.data.title,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
  });
  router.get("/:id", (req, res) => {
    const doc = db
      .prepare(
        "SELECT id,title,data,version,created_at AS createdAt,updated_at AS updatedAt FROM documents WHERE id=? AND user_id=?",
      )
      .get(req.params.id, res.locals.userId);
    if (!doc) {
      res.status(404).json({ error: "Không tìm thấy tài liệu." });
      return;
    }
    res.json(doc);
  });
  router.patch("/:id", (req, res) => {
    const parsed = z
      .object({
        title: title.optional(),
        data: documentData.optional(),
        version: z.number().int().positive(),
      })
      .strict()
      .refine((v) => v.title !== undefined || v.data !== undefined)
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Cập nhật tài liệu không hợp lệ." });
      return;
    }
    const old = db
      .prepare(
        "SELECT title,data,version FROM documents WHERE id=? AND user_id=?",
      )
      .get(req.params.id, res.locals.userId) as
      | { title: string; data: string; version: number }
      | undefined;
    if (!old) {
      res.status(404).json({ error: "Không tìm thấy tài liệu." });
      return;
    }
    if (old.version !== parsed.data.version) {
      res
        .status(409)
        .json({
          error:
            "Tài liệu đã thay đổi ở phiên khác. Hãy mở lại hoặc lưu thành bản mới.",
        });
      return;
    }
    const now = new Date().toISOString();
    const changed = db
      .prepare(
        "UPDATE documents SET title=?,data=?,updated_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?",
      )
      .run(
        parsed.data.title ?? old.title,
        parsed.data.data ?? old.data,
        now,
        req.params.id,
        res.locals.userId,
        old.version,
      );
    if (!changed.changes) {
      res
        .status(409)
        .json({ error: "Có thay đổi đồng thời. Hãy mở lại tài liệu." });
      return;
    }
    res.json({
      id: req.params.id,
      title: parsed.data.title ?? old.title,
      version: old.version + 1,
      updatedAt: now,
    });
  });
  router.delete("/:id", (req, res) => {
    const result = db
      .prepare("DELETE FROM documents WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    if (!result.changes) {
      res.status(404).json({ error: "Không tìm thấy tài liệu." });
      return;
    }
    res.status(204).end();
  });
  return router;
}
