import { useState } from "react";

import type { UserLlmSettings } from "../../../shared/contracts";
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

  function saveSettings(nextSettings: UserLlmSettings): void {
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
      onSave={saveSettings}
      onSavePreferences={savePreferences}
      onClose={() => void window.petAPI.closeSettingsWindow()}
    />
  );
}
