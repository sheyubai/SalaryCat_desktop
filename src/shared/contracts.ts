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

export interface PetAPI {
  getCharacterManifest(characterId: string): Promise<CharacterManifest>;
  assetUrl(relativePath: string): string;
  getWindowPosition(): Promise<WindowPosition>;
  moveWindow(position: WindowPosition): void;
  setWindowSize(size: WindowSize): void;
  openSettingsWindow(): Promise<void>;
  closeSettingsWindow(): Promise<void>;
  openProjectHomepage(): Promise<void>;
  setMousePassthrough(enabled: boolean): void;
  setAlwaysOnTop(enabled: boolean): void;
  selectMusicFile(): Promise<string | null>;
  getMusicUrl(path: string): Promise<string>;
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
  closeSettingsWindow: "settings:close",
  openProjectHomepage: "project:open-homepage",
  setMousePassthrough: "window:mouse-passthrough",
  setAlwaysOnTop: "window:always-on-top",
  selectMusicFile: "music:select-file",
  getMusicUrl: "music:get-url",
  sendChatMessage: "chat:send",
  chatDelta: "chat:delta"
} as const;
