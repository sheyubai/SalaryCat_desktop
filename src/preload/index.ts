import {contextBridge, ipcRenderer} from "electron";

import {
    IPC_CHANNELS,
    type ChatRequest,
    type ChatResponse,
    type CharacterManifest,
    type PetAPI,
    type WindowPosition,
    type WindowSize
} from "../shared/contracts";

const petAPI: PetAPI = {
    getCharacterManifest: (characterId: string): Promise<CharacterManifest> =>
        ipcRenderer.invoke(IPC_CHANNELS.characterManifest, characterId),
    assetUrl: (relativePath: string): string => {
        const normalized = relativePath
            .replaceAll("\\", "/")
            .split("/")
            .map(encodeURIComponent)
            .join("/");
        return `salary-cat://asset/${normalized}`;
    },
    getWindowPosition: (): Promise<WindowPosition> =>
        ipcRenderer.invoke(IPC_CHANNELS.windowPosition),
    moveWindow: (position: WindowPosition): void =>
        ipcRenderer.send(IPC_CHANNELS.moveWindow, position),
    setWindowSize: (size: WindowSize): void =>
        ipcRenderer.send(IPC_CHANNELS.setWindowSize, size),
    openSettingsWindow: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.openSettingsWindow),
    toggleSettingsWindow: (): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.toggleSettingsWindow),
    closeSettingsWindow: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.closeSettingsWindow),
    minimizeCurrentWindow: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.minimizeCurrentWindow),
    openProjectHomepage: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.openProjectHomepage),
    setMousePassthrough: (enabled: boolean): void =>
        ipcRenderer.send(IPC_CHANNELS.setMousePassthrough, enabled),
    setAlwaysOnTop: (enabled: boolean): void =>
        ipcRenderer.send(IPC_CHANNELS.setAlwaysOnTop, enabled),
    selectMusicFile: (): Promise<string | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.selectMusicFile),
    getMusicUrl: (path: string): Promise<string> =>
        ipcRenderer.invoke(IPC_CHANNELS.getMusicUrl, path),
    getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
    getUsageStats: () => ipcRenderer.invoke(IPC_CHANNELS.getUsageStats),
    recordUsageActivity: (kind, durationSeconds) =>
        ipcRenderer.invoke(IPC_CHANNELS.recordUsageActivity, kind, durationSeconds),
    sendChatMessage: (
        request: ChatRequest,
        onDelta?: (text: string) => void
    ): Promise<ChatResponse> => {
        const requestId = crypto.randomUUID();
        const listener = (
            _event: Electron.IpcRendererEvent,
            payload: {requestId: string; text: string}
        ): void => {
            if (payload.requestId === requestId) {
                onDelta?.(payload.text);
            }
        };
        ipcRenderer.on(IPC_CHANNELS.chatDelta, listener);
        return ipcRenderer
            .invoke(IPC_CHANNELS.sendChatMessage, {requestId, request})
            .finally(() => ipcRenderer.removeListener(IPC_CHANNELS.chatDelta, listener));
    }
};

contextBridge.exposeInMainWorld("petAPI", petAPI);
