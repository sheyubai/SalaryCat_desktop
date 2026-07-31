import { BrowserWindow, ipcMain, screen } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  IPC_CHANNELS,
  type CharacterManifest,
  type WindowPosition,
  type WindowSize
} from "../../shared/contracts";
import { resourcesDirectory } from "../paths";

function validateCharacterId(characterId: string): void {
  if (!/^[a-z0-9-]+$/i.test(characterId)) {
    throw new Error("Invalid character id.");
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.characterManifest,
    async (_event, characterId: string): Promise<CharacterManifest> => {
      validateCharacterId(characterId);
      const manifestPath = join(
        resourcesDirectory(),
        "characters",
        characterId,
        "manifest.json"
      );
      return JSON.parse(await readFile(manifestPath, "utf8")) as CharacterManifest;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.windowPosition,
    (event): WindowPosition => {
      const bounds = BrowserWindow.fromWebContents(event.sender)?.getBounds();
      return { x: bounds?.x ?? 0, y: bounds?.y ?? 0 };
    }
  );

  ipcMain.on(
    IPC_CHANNELS.moveWindow,
    (event, position: WindowPosition): void => {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return;
      }
      BrowserWindow.fromWebContents(event.sender)?.setPosition(
        Math.round(position.x),
        Math.round(position.y)
      );
    }
  );

  ipcMain.on(
    IPC_CHANNELS.setWindowSize,
    (event, size: WindowSize): void => {
      if (
        !Number.isFinite(size.width) ||
        !Number.isFinite(size.height) ||
        size.width < 180 ||
        size.height < 180 ||
        size.width > 800 ||
        size.height > 800
      ) {
        return;
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return;
      }

      const bounds = window.getBounds();
      const width = Math.round(size.width);
      const height = Math.round(size.height);
      const workArea = screen.getDisplayMatching(bounds).workArea;
      const anchoredX = bounds.x + bounds.width - width;
      const anchoredY = bounds.y + bounds.height - height;
      const x = Math.max(
        workArea.x,
        Math.min(anchoredX, workArea.x + workArea.width - width)
      );
      const y = Math.max(
        workArea.y,
        Math.min(anchoredY, workArea.y + workArea.height - height)
      );

      window.setBounds({ x, y, width, height });
    }
  );
}
