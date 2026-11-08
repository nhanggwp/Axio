import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};
export function authError(
  error: { code?: string; message?: string } | null | undefined,
) {
  const errors: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: "Email hoặc mật khẩu không đúng.",
    EMAIL_NOT_VERIFIED: "Bạn cần xác minh email trước khi đăng nhập.",
    USER_ALREADY_EXISTS:
      "Nếu email có thể đăng ký, bạn sẽ nhận được hướng dẫn xác minh.",
    EMAIL_NOT_CONFIGURED:
      "Máy chủ chưa cấu hình SMTP. Bạn vẫn có thể dùng chế độ khách.",
    INVALID_PASSWORD: "Mật khẩu hiện tại không đúng.",
    PASSWORD_TOO_SHORT: "Mật khẩu phải có ít nhất 10 ký tự.",
    PASSWORD_TOO_LONG: "Mật khẩu tối đa 128 ký tự.",
    INVALID_TOKEN: "Liên kết không hợp lệ hoặc đã hết hạn.",
    SESSION_EXPIRED: "Phiên đã hết hạn. Vui lòng đăng nhập lại.",
    TOO_MANY_REQUESTS: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
    USER_NOT_FOUND: "Email hoặc mật khẩu không đúng.",
  };
  return (
    errors[error?.code ?? ""] ||
    "Không thể hoàn tất yêu cầu tài khoản. Hãy kiểm tra thông tin và thử lại."
  );
}
