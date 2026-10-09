import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthSession, UsageStats, UserLlmSettings } from "../../../shared/contracts";
import { readableError } from "../../../shared/errors";

const emptySettings: UserLlmSettings = { apiKey: "", baseUrl: "", model: "", configured: false };

function notifyAccountChange(): void {
  const channel = new BroadcastChannel("salary-cat-auth");
  channel.postMessage("changed");
  channel.close();
}

/** 账号切换时丢弃旧请求结果，避免把上个账号的模型和统计显示给新账号。 */
export function useAccountSettings() {
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>();
  const [settings, setSettings] = useState(emptySettings);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ model: "", usage: "", account: "" });
  const generation = useRef(0);

  const load = useCallback(async (session?: AuthSession | null) => {
    const request = ++generation.current;
    setLoading(true);
    setErrors({ model: "", usage: "", account: "" });
    try {
      const current = session === undefined ? await window.petAPI.getAuthSession() : session;
      if (generation.current !== request) return;
      setAuthSession(current);
      const [model, usage] = await Promise.allSettled([
        window.petAPI.getModelConfiguration(), window.petAPI.getUsageStats()
      ]);
      const latestSession = await window.petAPI.getAuthSession();
      if (generation.current !== request) return;
      if (current && !latestSession) {
        setAuthSession(null);
        setSettings(emptySettings);
        setUsageStats(null);
        setErrors({ model: "登录已过期，请重新登录。", usage: "登录已过期，请重新登录。", account: "登录已过期，请重新登录。" });
        notifyAccountChange();
        return;
      }
      if (model.status === "fulfilled") {
        setSettings({ apiKey: "", baseUrl: model.value.baseUrl ?? "", model: model.value.model ?? "", configured: model.value.configured });
      }
      if (usage.status === "fulfilled") setUsageStats(usage.value);
      setErrors({
        account: "",
        model: model.status === "rejected" ? readableError(model.reason, "模型配置加载失败。") : "",
        usage: usage.status === "rejected" ? readableError(usage.reason, "统计加载失败。") : ""
      });
    } catch (error) {
      if (generation.current !== request) return;
      setAuthSession(null);
      setErrors({ account: readableError(error), model: "", usage: "" });
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, [load]);

  function handleLoggedIn(session: AuthSession): void {
    setSettings(emptySettings);
    setUsageStats(null);
    setAuthSession(session);
    notifyAccountChange();
    void load(session);
  }

  async function logout(): Promise<void> {
    ++generation.current;
    setLoading(false);
    try {
      await window.petAPI.logout();
      setAuthSession(null);
      setSettings(emptySettings);
      setUsageStats(null);
      setErrors({ model: "", usage: "", account: "" });
      notifyAccountChange();
    } catch (error) {
      setErrors((previous) => ({ ...previous, account: readableError(error) }));
    }
  }

  async function saveSettings(next: UserLlmSettings): Promise<void> {
    const request = ++generation.current;
    setLoading(false);
    await window.petAPI.saveModelConfiguration(next);
    if (generation.current !== request) throw new Error("账号或设置已变化，请重新确认配置。");
    setSettings({ ...next, apiKey: "", configured: true });
    setErrors((previous) => ({ ...previous, model: "" }));
  }

  return { authSession, settings, usageStats, loading, errors, reload: () => void load(), saveSettings, handleLoggedIn, logout };
}
