import { useEffect, useState } from "react";

import type { AuthSession, UsageStats, UserLlmSettings } from "../../../shared/contracts";
import { PetSettingsModal } from "../../components/pet/PetSettingsModal";
import {
  llmSettingsStorageKey,
  llmSettingsKeyFor,
  loadLlmSettings,
  loadPreferences,
  preferencesChannelName,
  preferencesStorageKey
} from "../../scripts/pet/userPreferences";

export function SettingsPage() {
  const [settings, setSettings] = useState<UserLlmSettings>(loadLlmSettings);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [appVersion, setAppVersion] = useState("V0.2.0");

  useEffect(() => {
    window.petAPI.getAuthSession().then((session) => {
      setAuthSession(session);
      setSettings(loadLlmSettings(llmSettingsKeyFor(session?.userId ?? session?.username)));
    }).catch(() => {
      setAuthSession(null);
      setSettings(loadLlmSettings());
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
    setSettings(nextSettings);
    localStorage.setItem(
      llmSettingsKeyFor(authSession?.userId ?? authSession?.username),
      JSON.stringify(nextSettings)
    );
  }

  async function logout(): Promise<void> {
    await window.petAPI.logout();
    setAuthSession(null);
    setSettings(loadLlmSettings(llmSettingsStorageKey));
  }

  function handleLoggedIn(session: AuthSession): void {
    setAuthSession(session);
    setSettings(loadLlmSettings(llmSettingsKeyFor(session.userId ?? session.username)));
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
