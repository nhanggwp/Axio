import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type Database from "better-sqlite3";
import type { ServerConfig } from "../config";
import type { createMailer } from "./email";
import { trustedAppOrigins } from "../origins";
export function createAuth(
  db: Database.Database,
  config: ServerConfig,
  mailer: ReturnType<typeof createMailer>,
) {
  return betterAuth({
    appName: "Axio",
    telemetry: { enabled: false },
    database: db,
    secret: config.authSecret,
    baseURL: config.origin,
    basePath: "/api/auth",
    trustedOrigins: trustedAppOrigins(config),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send(
          user.email,
          "Đặt lại mật khẩu Axio",
          `Bạn đã yêu cầu đặt lại mật khẩu Axio. Mở liên kết sau trong vòng một giờ:\n${url}\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.`,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send(
          user.email,
          "Xác minh email Axio",
          `Xác minh email để sử dụng không gian tài liệu Axio:\n${url}\n\nLiên kết có hiệu lực một giờ.`,
        );
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    user: { deleteUser: { enabled: true } },
    advanced: {
      useSecureCookies: config.production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.production,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: config.authRequestLimit ?? 30,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: config.authSignInLimit ?? 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    logger: { level: "error" },
  });
}
export async function migrateAuth(auth: ReturnType<typeof createAuth>) {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  return migrations;
}
