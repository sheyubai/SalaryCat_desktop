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
  setMousePassthrough(enabled: boolean): void;
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
  setMousePassthrough: "window:mouse-passthrough",
  sendChatMessage: "chat:send",
  chatDelta: "chat:delta"
} as const;
