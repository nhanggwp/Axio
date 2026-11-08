import { useState } from "react";
import { authClient, authError, type AuthUser } from "./client";
import { IconButton } from "../components/Icon";
export type AuthView =
  | "login"
  | "register"
  | "forgot"
  | "reset"
  | "verify"
  | "profile";
export function AuthDialog({
  initialView,
  user,
  onClose,
  onAuthenticated,
  emailConfigured,
}: {
  initialView: AuthView;
  user: AuthUser | null;
  onClose: () => void;
  onAuthenticated: () => void;
  emailConfigured: boolean;
}) {
  const [view, setView] = useState<AuthView>(initialView),
    [name, setName] = useState(user?.name ?? ""),
    [email, setEmail] = useState(user?.email ?? ""),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const titles: Record<AuthView, string> = {
    login: "Đăng nhập",
    register: "Đăng ký",
    forgot: "Quên mật khẩu",
    reset: "Đặt lại mật khẩu",
    verify: "Xác minh email",
    profile: "Hồ sơ cá nhân",
  };
  const switchView = (next: AuthView) => {
    setView(next);
    setError("");
    setNotice("");
    setPassword("");
    setNewPassword("");
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể hoàn tất yêu cầu.");
    } finally {
      setBusy(false);
    }
  };
  const check = (result: {
    error?: { code?: string; message?: string } | null;
  }) => {
    if (result.error) throw new Error(authError(result.error));
  };
  const callbackURL = window.location.origin + "/?auth=verified";
  const submit = () =>
    run(async () => {
      if (view === "login") {
        check(
          await authClient.signIn.email({ email, password, rememberMe: true }),
        );
        onAuthenticated();
        onClose();
      }
      if (view === "register") {
        check(
          await authClient.signUp.email({ name, email, password, callbackURL }),
        );
        setPassword("");
        setView("verify");
        setNotice(
          "Nếu email có thể đăng ký, hướng dẫn xác minh đã được gửi. Vui lòng kiểm tra hộp thư và thư rác.",
        );
      }
      if (view === "forgot") {
        check(
          await authClient.requestPasswordReset({
            email,
            redirectTo: window.location.origin + "/?auth=reset",
          }),
        );
        setNotice(
          "Nếu email có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu.",
        );
      }
      if (view === "reset") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("Liên kết không có mã đặt lại mật khẩu.");
        check(await authClient.resetPassword({ token, newPassword }));
        window.history.replaceState({}, "", window.location.pathname);
        setView("login");
        setNotice("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      }
      if (view === "profile") {
        check(await authClient.updateUser({ name }));
        onAuthenticated();
        setNotice("Đã cập nhật hồ sơ.");
      }
    });
  return (
    <div className="modal-backdrop">
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={titles[view]}
      >
        <header>
          <h2>{titles[view]}</h2>
          <IconButton icon="close" label="Đóng tài khoản" onClick={onClose} />
        </header>
        <p>Không gian hình học của bạn · Axio</p>
        {!emailConfigured &&
          ["register", "forgot", "verify"].includes(view) && (
            <p className="error-card">
              Máy chủ chưa cấu hình gửi email. Bạn có thể tiếp tục dựng hình ở
              chế độ khách.
            </p>
          )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {["register", "profile"].includes(view) && (
            <label className="field">
              Tên hiển thị
              <input
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {view !== "reset" && (
            <label className="field">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={view === "profile" || view === "verify"}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {["login", "register"].includes(view) && (
            <label className="field">
              Mật khẩu
              <input
                type="password"
                required
                minLength={view === "register" ? 10 : 1}
                maxLength={128}
                autoComplete={
                  view === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {view === "register" && (
            <small>
              Ít nhất 10 ký tự. Hình đang dựng được giữ nguyên khi đăng nhập.
            </small>
          )}
          {view === "reset" && (
            <label className="field">
              Mật khẩu mới
              <input
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
          )}
          {view === "verify" ? (
            <>
              <p>
                Mở liên kết trong email để xác minh, rồi quay lại đăng nhập.
                Liên kết có hiệu lực một giờ.
              </p>
              <button
                type="button"
                disabled={busy || !emailConfigured}
                onClick={() =>
                  void run(async () => {
                    check(
                      await authClient.sendVerificationEmail({
                        email,
                        callbackURL,
                      }),
                    );
                    setNotice("Nếu cần xác minh, email hướng dẫn đã được gửi.");
                  })
                }
              >
                Gửi lại email xác minh
              </button>
            </>
          ) : (
            <button
              className="primary"
              type="submit"
              disabled={
                busy ||
                (!emailConfigured && ["register", "forgot"].includes(view))
              }
            >
              {busy
                ? "Đang xử lý…"
                : view === "profile"
                  ? "Lưu hồ sơ"
                  : view === "forgot"
                    ? "Gửi liên kết đặt lại"
                    : titles[view]}
            </button>
          )}
        </form>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="error-card" role="alert">
            {error}
          </p>
        )}
        {view === "login" && (
          <div className="auth-links">
            <button onClick={() => switchView("forgot")}>Quên mật khẩu?</button>
            <button onClick={() => switchView("register")}>
              Tạo tài khoản
            </button>
          </div>
        )}
        {["register", "forgot", "reset", "verify"].includes(view) && (
          <button onClick={() => switchView("login")}>
            Quay lại đăng nhập
          </button>
        )}
        {view === "profile" && user && (
          <>
            <p>Email {user.emailVerified ? "đã xác minh" : "chưa xác minh"}</p>
            <details>
              <summary>Đổi mật khẩu</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    check(
                      await authClient.changePassword({
                        currentPassword: password,
                        newPassword,
                        revokeOtherSessions: true,
                      }),
                    );
                    setPassword("");
                    setNewPassword("");
                    setNotice("Đã đổi mật khẩu và thu hồi các phiên khác.");
                  });
                }}
              >
                <label className="field">
                  Mật khẩu hiện tại
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  Mật khẩu mới
                  <input
                    type="password"
                    minLength={10}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Đổi mật khẩu</button>
              </form>
            </details>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  check(await authClient.signOut());
                  onAuthenticated();
                  onClose();
                })
              }
            >
              Đăng xuất
            </button>
            <button className="danger-text" onClick={() => setDeleting(true)}>
              Xóa tài khoản
            </button>
            {deleting && (
              <div className="error-card">
                <p>
                  Xóa vĩnh viễn tài khoản và toàn bộ tài liệu đã lưu trên máy
                  chủ. Nhập XÓA và mật khẩu để xác nhận.
                </p>
                <label className="field">
                  Xác nhận
                  <input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
                <label className="field">
                  Mật khẩu hiện tại
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={() => setDeleting(false)}>
                    Giữ tài khoản
                  </button>
                  <button
                    disabled={busy || confirmation !== "XÓA" || !password}
                    onClick={() =>
                      void run(async () => {
                        check(await authClient.deleteUser({ password }));
                        onAuthenticated();
                        onClose();
                      })
                    }
                  >
                    Xóa vĩnh viễn
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
