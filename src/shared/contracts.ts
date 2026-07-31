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

export interface PetAPI {
  getCharacterManifest(characterId: string): Promise<CharacterManifest>;
  assetUrl(relativePath: string): string;
  getWindowPosition(): Promise<WindowPosition>;
  moveWindow(position: WindowPosition): void;
  setWindowSize(size: WindowSize): void;
}

export const IPC_CHANNELS = {
  characterManifest: "character:manifest",
  windowPosition: "window:position",
  moveWindow: "window:move",
  setWindowSize: "window:size"
} as const;
