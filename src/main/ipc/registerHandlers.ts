import { BrowserWindow, dialog, ipcMain, screen, type OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import {
  IPC_CHANNELS,
  type CharacterManifest,
  type ModelConfigurationStatus,
  type UserLlmSettings,
  type WindowPosition,
  type WindowSize
} from "../../shared/contracts";
import { registerChatHandlers } from "./chatHandlers";
import { resourcesDirectory } from "../paths";
import { backendFetch, errorDetail, registerAuthHandlers, unwrapBackendBody } from "../backend/client";

const supportedAudioExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
const registeredMusicFiles = new Map<string, string>();

function validateCharacterId(characterId: string): void {
  if (!/^[a-z0-9-]+$/i.test(characterId)) {
    throw new Error("Invalid character id.");
  }
}

export function getRegisteredMusicFile(id: string): string | undefined {
  return registeredMusicFiles.get(id);
}

export async function registerIpcHandlers(): Promise<void> {
  await registerAuthHandlers();

  registerChatHandlers();

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

  ipcMain.on(
    IPC_CHANNELS.setMousePassthrough,
    (event, enabled: boolean): void => {
      if (typeof enabled !== "boolean") {
        return;
      }
      BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(enabled, {
        forward: true
      });
    }
  );

  ipcMain.on(IPC_CHANNELS.setAlwaysOnTop, (event, enabled: boolean): void => {
    if (typeof enabled !== "boolean") {
      return;
    }
    BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(
      enabled,
      enabled ? "screen-saver" : "normal"
    );
  });

  ipcMain.handle(IPC_CHANNELS.selectMusicFile, async (event): Promise<string | null> => {
    const options: OpenDialogOptions = {
      title: "选择背景音乐",
      properties: ["openFile"],
      filters: [{ name: "音频文件", extensions: ["mp3", "wav", "ogg", "m4a", "flac"] }]
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.getMusicUrl, async (_event, filePath: string): Promise<string> => {
    if (typeof filePath !== "string" || !filePath) {
      throw new Error("音乐文件路径无效。");
    }
    if (!supportedAudioExtensions.has(extname(filePath).toLowerCase())) {
      throw new Error("仅支持常见音频格式。");
    }
    await access(filePath, constants.R_OK);
    const musicId = randomUUID();
    registeredMusicFiles.set(musicId, filePath);
    return `salary-cat://music/${musicId}`;
  });

  ipcMain.handle(IPC_CHANNELS.getUsageStats, async () => {
    const response = await backendFetch(`/api/v1/usage`);
    if (!response.ok) {
      throw new Error(errorDetail(await response.json().catch(() => null), response.status));
    }
    return response.json();
  });

  ipcMain.handle(IPC_CHANNELS.getModelConfiguration, async (): Promise<ModelConfigurationStatus> => {
    const response = await backendFetch("/api/v1/model-config");
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(errorDetail(body, response.status));
    }
    const value = unwrapBackendBody(body);
    if (typeof value !== "object" || value === null) {
      throw new Error("后端返回的模型配置无效。");
    }
    const config = value as Record<string, unknown>;
    return {
      configured: config.configured === true,
      baseUrl: typeof config.base_url === "string" ? config.base_url : null,
      model: typeof config.model === "string" ? config.model : null
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.saveModelConfiguration,
    async (_event, settings: UserLlmSettings): Promise<void> => {
      const apiKey = settings.apiKey.trim();
      const baseUrl = settings.baseUrl.trim().replace(/\/$/, "");
      const model = settings.model.trim();
      if (!apiKey || !baseUrl || !model) {
        throw new Error("请完整填写 API Key、接口地址和模型名称。");
      }
      const response = await backendFetch("/api/v1/model-config", {
        method: "PUT",
        body: JSON.stringify({ api_key: apiKey, base_url: baseUrl, model })
      });
      if (!response.ok) {
        throw new Error(errorDetail(await response.json().catch(() => null), response.status));
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.recordUsageActivity,
    async (_event, kind: "chat" | "dance", durationSeconds: number): Promise<void> => {
      if (!(["chat", "dance"] as const).includes(kind) || !Number.isFinite(durationSeconds)) {
        return;
      }
      const response = await backendFetch(`/api/v1/usage/activity`, {
        method: "POST",
        body: JSON.stringify({ kind, duration_seconds: Math.round(durationSeconds) })
      });
      if (!response.ok && response.status !== 401) {
        throw new Error(errorDetail(await response.json().catch(() => null), response.status));
      }
    }
  );

}
