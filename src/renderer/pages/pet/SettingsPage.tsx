import { useEffect, useState } from "react";

import type { AuthSession, UsageStats, UserLlmSettings } from "../../../shared/contracts";
import { PetSettingsModal } from "../../components/pet/PetSettingsModal";
import {
  loadPreferences,
  preferencesChannelName,
  preferencesStorageKey
} from "../../scripts/pet/userPreferences";

const emptyModelSettings: UserLlmSettings = { apiKey: "", baseUrl: "", model: "", configured: false };

export function SettingsPage() {
  const [settings, setSettings] = useState<UserLlmSettings>(emptyModelSettings);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [appVersion, setAppVersion] = useState("V0.2.0");

  useEffect(() => {
    window.petAPI.getAuthSession().then((session) => {
      setAuthSession(session);
      if (!session) {
        setSettings(emptyModelSettings);
        return;
      }
      window.petAPI.getModelConfiguration()
        .then((config) => setSettings({
          apiKey: "",
          baseUrl: config.baseUrl ?? "",
          model: config.model ?? "",
          configured: config.configured
        }))
        .catch(() => setSettings(emptyModelSettings));
    }).catch(() => {
      setAuthSession(null);
      setSettings(emptyModelSettings);
    });
  }, []);

  useEffect(() => {
    if (!authSession) {
      setUsageStats(null);
      return;
    }
    window.petAPI.getUsageStats().then(setUsageStats).catch(async () => {
      setUsageStats(null);
      setAuthSession(await window.petAPI.getAuthSession().catch(() => null));
    });
  }, [authSession]);

  useEffect(() => {
    window.petAPI.getAppVersion().then((version) => setAppVersion(`V${version}`)).catch(() => undefined);
  }, []);

  async function saveSettings(nextSettings: UserLlmSettings): Promise<void> {
    await window.petAPI.saveModelConfiguration(nextSettings);
    setSettings({ ...nextSettings, apiKey: "", configured: true });
  }

  async function logout(): Promise<void> {
    await window.petAPI.logout();
    setAuthSession(null);
    setSettings(emptyModelSettings);
  }

  function handleLoggedIn(session: AuthSession): void {
    setAuthSession(session);
    void window.petAPI.getModelConfiguration()
      .then((config) => setSettings({
        apiKey: "",
        baseUrl: config.baseUrl ?? "",
        model: config.model ?? "",
        configured: config.configured
      }))
      .catch(() => setSettings(emptyModelSettings));
  }

  if (authSession === undefined) {
    return <div className="loading-bubble">月薪喵正在检查登录状态…</div>;
  }

  function savePreferences(nextPreferences: typeof preferences): void {
    setPreferences(nextPreferences);
    localStorage.setItem(preferencesStorageKey, JSON.stringify(nextPreferences));
    const channel = new BroadcastChannel(preferencesChannelName);
    channel.postMessage("updated");
    channel.close();
  }

  return (
    <PetSettingsModal
      settings={settings}
      preferences={preferences}
      usageStats={usageStats}
      authSession={authSession}
      appVersion={appVersion}
      onSave={saveSettings}
      onLoggedIn={handleLoggedIn}
      onLogout={() => void logout()}
      onSavePreferences={savePreferences}
      onClose={() => void window.petAPI.closeSettingsWindow()}
    />
  );
}
