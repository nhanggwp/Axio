import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export interface ServerConfig {
  port: number;
  host: string;
  origin: string;
  databasePath: string;
  authSecret: string;
  production: boolean;
  trustProxy?: 0 | 1;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  mailFrom: string;
  deepseekKey?: string;
  deepseekModel: string;
  deepseekReasoningEffort?: "none" | "low" | "high" | "max";
  guestDailyLimit: number;
  userDailyLimit: number;
  aiRequestLimit?: number;
  authRequestLimit?: number;
  authSignInLimit?: number;
}
export function loadConfig(): ServerConfig {
  const trustProxy = Number(process.env.TRUST_PROXY || 0);
  if (trustProxy !== 0 && trustProxy !== 1) throw new Error("TRUST_PROXY phải là 0 hoặc 1.");
  const effort = process.env.DEEPSEEK_REASONING_EFFORT || "low";
  if (!["none", "low", "high", "max"].includes(effort)) throw new Error("DEEPSEEK_REASONING_EFFORT phải là none, low, high hoặc max.");
  const production = process.env.NODE_ENV === "production";
  const databasePath = path.resolve(
    process.env.DATABASE_PATH || "data/axio.sqlite",
  );
  mkdirSync(path.dirname(databasePath), { recursive: true });
  let authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    if (production)
      throw new Error("Cần BETTER_AUTH_SECRET khi chạy production.");
    const file = path.join(path.dirname(databasePath), ".auth-secret");
    if (!existsSync(file))
      writeFileSync(file, randomBytes(48).toString("base64url"), {
        mode: 0o600,
      });
    authSecret = readFileSync(file, "utf8").trim();
  }
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
  if (production && !origin.startsWith("https://"))
    throw new Error("APP_ORIGIN phải dùng HTTPS trong production.");
  return {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || "127.0.0.1",
    origin: new URL(origin).origin,
    databasePath,
    authSecret,
    production,
    trustProxy,
    authRequestLimit: Number(process.env.AUTH_REQUESTS_PER_MINUTE) || 30,
    authSignInLimit: Number(process.env.AUTH_SIGNIN_PER_MINUTE) || 8,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    mailFrom: process.env.MAIL_FROM || "Axio <no-reply@localhost>",
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-flash",
    deepseekReasoningEffort: effort as ServerConfig["deepseekReasoningEffort"],
    guestDailyLimit: Number(process.env.AI_GUEST_DAILY_LIMIT) || 20,
    userDailyLimit: Number(process.env.AI_USER_DAILY_LIMIT) || 100,
    aiRequestLimit: Number(process.env.AI_REQUESTS_PER_MINUTE) || 12,
  };
}
