import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import type { UserLlmSettings, UserPreferences } from "../../../shared/contracts";

export const preferencesStorageKey = "salary-cat-preferences";
export const preferencesChannelName = "salary-cat-preferences";
export const llmSettingsStorageKey = "salary-cat-llm-settings";

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const messages = value
    .filter((message): message is string => typeof message === "string")
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 30);
  return messages.length ? messages : fallback;
}

export function defaultPreferences(): UserPreferences {
  return {
    appearance: {
      scale: 1,
      opacity: 100,
      alwaysOnTop: true
    },
    behavior: {
      sleepAfterSeconds: DEFAULT_CONFIG.behavior.sleepAfterMs / 1_000,
      dismissAfterSeconds: 40,
      sleepMessages: [...DEFAULT_CONFIG.behavior.sleepMessages]
    },
    music: {
      sourcePath: "",
      volume: 70,
      loop: true
    }
  };
}

export function loadPreferences(): UserPreferences {
  try {
    const defaults = defaultPreferences();
    const stored = JSON.parse(localStorage.getItem(preferencesStorageKey) ?? "{}") as Partial<UserPreferences>;
    return {
      appearance: {
        scale: numberInRange(stored.appearance?.scale, defaults.appearance.scale, 0.8, 1.25),
        opacity: numberInRange(stored.appearance?.opacity, defaults.appearance.opacity, 40, 100),
        alwaysOnTop: typeof stored.appearance?.alwaysOnTop === "boolean"
          ? stored.appearance.alwaysOnTop
          : defaults.appearance.alwaysOnTop
      },
      behavior: {
        sleepAfterSeconds: numberInRange(
          stored.behavior?.sleepAfterSeconds,
          defaults.behavior.sleepAfterSeconds,
          10,
          86_400
        ),
        dismissAfterSeconds: numberInRange(
          stored.behavior?.dismissAfterSeconds,
          defaults.behavior.dismissAfterSeconds,
          5,
          3_600
        ),
        sleepMessages: stringArray(stored.behavior?.sleepMessages, defaults.behavior.sleepMessages)
      },
      music: {
        sourcePath: typeof stored.music?.sourcePath === "string" ? stored.music.sourcePath : "",
        volume: numberInRange(stored.music?.volume, defaults.music.volume, 0, 100),
        loop: typeof stored.music?.loop === "boolean" ? stored.music.loop : defaults.music.loop
      }
    };
  } catch {
    return defaultPreferences();
  }
}

export function loadLlmSettings(): UserLlmSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(llmSettingsStorageKey) ?? "{}") as Partial<UserLlmSettings>;
    return {
      apiKey: typeof stored.apiKey === "string" ? stored.apiKey.trim() : "",
      baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl.trim() : "",
      model: typeof stored.model === "string" ? stored.model.trim() : ""
    };
  } catch {
    return { apiKey: "", baseUrl: "", model: "" };
  }
}
