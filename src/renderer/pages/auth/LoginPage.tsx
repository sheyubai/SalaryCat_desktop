import { FormEvent, useState } from "react";

import type { AuthSession } from "../../../shared/contracts";

interface LoginPageProps {
  onLoggedIn: (session: AuthSession) => void;
  embedded?: boolean;
}

export function LoginPage({ onLoggedIn, embedded = false }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const normalizedUsername = username.trim();
      if (!/^[A-Za-z0-9_]{3,32}$/.test(normalizedUsername)) {
        throw new Error("账号需为 3-32 位字母、数字或下划线。");
      }
      if (password.length < 8) {
        throw new Error("密码至少需要 8 位。");
      }
      const session = mode === "login"
        ? await window.petAPI.login({ username: normalizedUsername, password })
        : await window.petAPI.register({
          username: normalizedUsername,
          password,
          displayName: displayName.trim() || undefined
        });
      onLoggedIn(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`login-page${embedded ? " login-page-embedded" : ""}`}>
      <section className="login-card">
        <div className="login-mark">🐱</div>
        <p className="login-eyebrow">SALARY CAT</p>
        <h1>{mode === "login" ? "欢迎回来" : "创建账号"}</h1>
        <p className="login-subtitle">{mode === "login" ? "登录后，让月薪喵继续陪你工作。" : "注册后，统计和模型配置会跟随你的账号。"}</p>
        <form onSubmit={submit}>
          <label className="login-field">
            <span>账号</span>
            <input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" autoComplete="username" />
          </label>
          {mode === "register" && <label className="login-field">
            <span>昵称（可选）</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="月薪喵用户" autoComplete="nickname" maxLength={64} />
          </label>}
          <label className="login-field">
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" autoComplete="current-password" />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? (mode === "login" ? "登录中…" : "注册中…") : (mode === "login" ? "登录" : "注册并登录")}
          </button>
        </form>
        <button
          type="button"
          className="login-switch"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "还没有账号？立即注册" : "已有账号？返回登录"}
        </button>
        <p className="login-note">账号由月薪喵后端统一管理</p>
      </section>
    </main>
  );
}
