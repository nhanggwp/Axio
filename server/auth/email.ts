import nodemailer from "nodemailer";
import type { ServerConfig } from "../config";
export function createMailer(config: ServerConfig) {
  const transport = config.smtpHost
    ? nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        requireTLS: config.production && !config.smtpSecure,
        ...(config.smtpUser
          ? { auth: { user: config.smtpUser, pass: config.smtpPassword } }
          : {}),
        connectionTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;
  return {
    configured: !!transport,
    async send(to: string, subject: string, text: string) {
      if (!transport) throw new Error("Chưa cấu hình SMTP để gửi email.");
      await transport.sendMail({ from: config.mailFrom, to, subject, text });
    },
  };
}
