import { BrowserWindow, dialog, ipcMain, net, screen, type OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import {
  IPC_CHANNELS,
  type ChatRequest,
  type ChatResponse,
  type CharacterManifest,
  type WindowPosition,
  type WindowSize
} from "../../shared/contracts";
import { resourcesDirectory } from "../paths";

const apiBaseUrl = (process.env.SALARY_CAT_API_URL ?? "http://127.0.0.1:8000")
  .replace(/\/$/, "");
const supportedAudioExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
const registeredMusicFiles = new Map<string, string>();

interface BackendStreamEvent {
  type: "start" | "delta" | "done" | "error";
  conversation_id?: string;
  message_id?: string;
  text?: string;
  detail?: string;
}

function errorDetail(body: unknown, status: number): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }
  return `后端请求失败（HTTP ${status}）。`;
}

function validateCharacterId(characterId: string): void {
  if (!/^[a-z0-9-]+$/i.test(characterId)) {
    throw new Error("Invalid character id.");
  }
}

export function getRegisteredMusicFile(id: string): string | undefined {
  return registeredMusicFiles.get(id);
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.sendChatMessage,
    async (
      event,
      payload: { requestId: string; request: ChatRequest }
    ): Promise<ChatResponse> => {
      const { requestId, request } = payload;
      const message = request.message.trim();
      if (!message || message.length > 4000) {
        throw new Error("消息内容无效。");
      }

      let response: Response;
      try {
        response = await net.fetch(`${apiBaseUrl}/api/v1/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            conversation_id: request.conversationId,
            llm_api_key: request.apiKey,
            llm_base_url: request.baseUrl,
            llm_model: request.model
          })
        });
      } catch {
        throw new Error("无法连接月薪喵后端，请确认后端已在 8000 端口启动。");
      }

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(errorDetail(body, response.status));
      }
      if (!response.body) {
        throw new Error("后端没有返回可读取的数据流。");
      }

      let conversationId = "";
      let messageId = "";
      let answer = "";
      let buffer = "";
      const decoder = new TextDecoder();
      const reader = response.body.getReader();

      const consumeLine = (line: string): void => {
        if (!line.trim()) {
          return;
        }
        const streamEvent = JSON.parse(line) as BackendStreamEvent;
        if (streamEvent.type === "start" || streamEvent.type === "done") {
          conversationId = streamEvent.conversation_id ?? conversationId;
          messageId = streamEvent.message_id ?? messageId;
        } else if (streamEvent.type === "delta" && streamEvent.text) {
          answer += streamEvent.text;
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.chatDelta, {
              requestId,
              text: streamEvent.text
            });
          }
        } else if (streamEvent.type === "error") {
          throw new Error(streamEvent.detail || "模型生成回复失败。");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          consumeLine(line);
        }
        if (done) {
          break;
        }
      }
      consumeLine(buffer);

      if (!conversationId || !messageId) {
        throw new Error("后端流式响应未正常完成。");
      }
      return {
        conversationId,
        messageId,
        answer
      };
    }
  );

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
    const response = await net.fetch(`${apiBaseUrl}/api/v1/usage`);
    if (!response.ok) {
      throw new Error(errorDetail(await response.json().catch(() => null), response.status));
    }
    return response.json();
  });

  ipcMain.handle(
    IPC_CHANNELS.recordUsageActivity,
    async (_event, kind: "chat" | "dance", durationSeconds: number): Promise<void> => {
      if (!(["chat", "dance"] as const).includes(kind) || !Number.isFinite(durationSeconds)) {
        return;
      }
      await net.fetch(`${apiBaseUrl}/api/v1/usage/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, duration_seconds: Math.round(durationSeconds) })
      });
    }
  );

}
