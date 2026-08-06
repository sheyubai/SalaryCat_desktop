import { useEffect, useState } from "react";

import type { UsageStats, UserLlmSettings } from "../../../shared/contracts";
import { PetSettingsModal } from "../../components/pet/PetSettingsModal";
import {
  llmSettingsStorageKey,
  loadLlmSettings,
  loadPreferences,
  preferencesChannelName,
  preferencesStorageKey
} from "../../scripts/pet/userPreferences";

export function SettingsPage() {
  const [settings, setSettings] = useState<UserLlmSettings>(loadLlmSettings);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [appVersion, setAppVersion] = useState("V0.2.0");

  useEffect(() => {
    window.petAPI.getUsageStats().then(setUsageStats).catch(() => setUsageStats(null));
  }, []);

  useEffect(() => {
    window.petAPI.getAppVersion().then((version) => setAppVersion(`V${version}`)).catch(() => undefined);
  }, []);

  async function saveSettings(nextSettings: UserLlmSettings): Promise<void> {
    await window.petAPI.saveModelConfig(nextSettings);
    setSettings(nextSettings);
    localStorage.setItem(llmSettingsStorageKey, JSON.stringify(nextSettings));
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
      appVersion={appVersion}
      onSave={saveSettings}
      onSavePreferences={savePreferences}
      onClose={() => void window.petAPI.closeSettingsWindow()}
    />
  );
}
