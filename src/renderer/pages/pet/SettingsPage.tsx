import { useEffect, useState } from "react";

import { useAccountSettings } from "./useAccountSettings";
import { PetSettingsModal } from "../../components/pet/PetSettingsModal";
import {
  loadPreferences,
  preferencesChannelName,
  preferencesStorageKey
} from "../../scripts/pet/userPreferences";

export function SettingsPage() {
  const { settings, authSession, usageStats, loading, errors, reload, saveSettings, handleLoggedIn, logout } = useAccountSettings();
  const [preferences, setPreferences] = useState(loadPreferences);
  const [appVersion, setAppVersion] = useState("V0.2.0");

  useEffect(() => {
    window.petAPI.getAppVersion().then((version) => setAppVersion(`V${version}`)).catch(() => undefined);
  }, []);

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
      loading={loading}
      loadErrors={errors}
      onReload={reload}
      onSave={saveSettings}
      onLoggedIn={handleLoggedIn}
      onLogout={() => void logout()}
      onSavePreferences={savePreferences}
      onClose={() => void window.petAPI.closeSettingsWindow()}
    />
  );
}
