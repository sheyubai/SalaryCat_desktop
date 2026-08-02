export type PetState =
  | "idle"
  | "happy"
  | "sleep"
  | "thinking"
  | "working";

export interface CharacterManifest {
  id: string;
  name: string;
  version: string;
  defaultState: PetState;
  animations: Partial<Record<PetState, string>>;
  sounds?: Record<string, string>;
}

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface UserLlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface UserAppearanceSettings {
  scale: number;
  opacity: number;
  alwaysOnTop: boolean;
}

export interface UserBehaviorSettings {
  sleepAfterSeconds: number;
  dismissAfterSeconds: number;
  sleepMessages: string[];
}

export interface UserPreferences {
  appearance: UserAppearanceSettings;
  behavior: UserBehaviorSettings;
  music: UserMusicSettings;
}

export interface UserMusicSettings {
  sourcePath: string;
  volume: number;
  loop: boolean;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  answer: string;
}

export interface DailyTokenUsage { date: string; tokens: number; }
export interface UsageStats {
  total_tokens: number;
  peak_day_tokens: number;
  peak_day: string | null;
  chat_duration_seconds: number;
  current_streak_days: number;
  longest_streak_days: number;
  dance_duration_seconds: number;
  daily_tokens: DailyTokenUsage[];
}

export interface PetAPI {
  getCharacterManifest(characterId: string): Promise<CharacterManifest>;
  assetUrl(relativePath: string): string;
  getWindowPosition(): Promise<WindowPosition>;
  moveWindow(position: WindowPosition): void;
  setWindowSize(size: WindowSize): void;
  openSettingsWindow(): Promise<void>;
  toggleSettingsWindow(): Promise<boolean>;
  closeSettingsWindow(): Promise<void>;
  minimizeCurrentWindow(): Promise<void>;
  openProjectHomepage(): Promise<void>;
  setMousePassthrough(enabled: boolean): void;
  setAlwaysOnTop(enabled: boolean): void;
  selectMusicFile(): Promise<string | null>;
  getMusicUrl(path: string): Promise<string>;
  getAppVersion(): Promise<string>;
  getUsageStats(): Promise<UsageStats>;
  recordUsageActivity(kind: "chat" | "dance", durationSeconds: number): Promise<void>;
  sendChatMessage(
    request: ChatRequest,
    onDelta?: (text: string) => void
  ): Promise<ChatResponse>;
}

export const IPC_CHANNELS = {
  characterManifest: "character:manifest",
  windowPosition: "window:position",
  moveWindow: "window:move",
  setWindowSize: "window:size",
  openSettingsWindow: "settings:open",
  toggleSettingsWindow: "settings:toggle",
  closeSettingsWindow: "settings:close",
  minimizeCurrentWindow: "window:minimize",
  openProjectHomepage: "project:open-homepage",
  setMousePassthrough: "window:mouse-passthrough",
  setAlwaysOnTop: "window:always-on-top",
  selectMusicFile: "music:select-file",
  getMusicUrl: "music:get-url",
  getAppVersion: "app:version",
  getUsageStats: "usage:stats",
  recordUsageActivity: "usage:record-activity",
  sendChatMessage: "chat:send",
  chatDelta: "chat:delta"
} as const;
