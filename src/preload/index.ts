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
    setMousePassthrough: (enabled: boolean): void =>
        ipcRenderer.send(IPC_CHANNELS.setMousePassthrough, enabled),
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
