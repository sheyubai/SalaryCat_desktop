import {contextBridge, ipcRenderer} from "electron";

import {
    IPC_CHANNELS,
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
        ipcRenderer.send(IPC_CHANNELS.setWindowSize, size)
};

contextBridge.exposeInMainWorld("petAPI", petAPI);
