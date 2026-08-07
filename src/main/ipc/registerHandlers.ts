import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, screen, type OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import {
  IPC_CHANNELS,
  type ChatRequest,
  type ChatResponse,
  type CharacterManifest,
  type AuthSession,
  type WindowPosition,
  type WindowSize
} from "../../shared/contracts";
import { resourcesDirectory } from "../paths";

const apiBaseUrl = (process.env.SALARY_CAT_API_URL ?? "http://127.0.0.1:8000")
  .replace(/\/$/, "");
const clientToken = process.env.SALARY_CAT_CLIENT_TOKEN?.trim();
interface BackendAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  username?: string;
  displayName?: string;
  userId?: string;
}

let authSession: BackendAuthSession | null = null;
let authSessionLoaded = false;
let refreshPromise: Promise<boolean> | null = null;
const supportedAudioExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
const registeredMusicFiles = new Map<string, string>();

function authSessionPath(): string {
  return join(app.getPath("userData"), "auth-session.dat");
}

async function loadAuthSession(): Promise<void> {
  if (authSessionLoaded) {
    return;
  }
  authSessionLoaded = true;
  if (!safeStorage.isEncryptionAvailable()) {
    return;
  }
  try {
    const encrypted = await readFile(authSessionPath(), "utf8");
    const value = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64"))) as Partial<BackendAuthSession>;
    if (typeof value.accessToken === "string" && value.accessToken) {
      authSession = {
        accessToken: value.accessToken,
        refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : "",
        tokenType: typeof value.tokenType === "string" && value.tokenType ? value.tokenType : "Bearer",
        username: typeof value.username === "string" ? value.username : undefined,
        displayName: typeof value.displayName === "string" ? value.displayName : undefined,
        userId: typeof value.userId === "string" ? value.userId : undefined
      };
    }
  } catch {
    authSession = null;
  }
}

async function persistAuthSession(): Promise<void> {
  if (!authSession || !safeStorage.isEncryptionAvailable()) {
    return;
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(authSession)).toString("base64");
  await writeFile(authSessionPath(), encrypted, "utf8");
}

async function clearAuthSession(): Promise<void> {
  authSession = null;
  authSessionLoaded = true;
  await unlink(authSessionPath()).catch(() => undefined);
}

interface BackendStreamEvent {
  type: "start" | "delta" | "done" | "error";
  conversation_id?: string;
  message_id?: string;
  text?: string;
  detail?: string;
  message?: string;
}

function errorDetail(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const value = body as Record<string, unknown>;
    for (const candidate of [value.message, value.detail]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    if (typeof value.data === "object" && value.data !== null) {
      const data = value.data as Record<string, unknown>;
      for (const candidate of [data.message, data.detail]) {
        if (typeof candidate === "string" && candidate.trim()) return candidate;
      }
    }
  }
  return `后端请求失败（HTTP ${status}）。`;
}

function unwrapBackendBody(body: unknown): unknown {
  if (typeof body === "object" && body !== null && "data" in body) {
    const value = body as Record<string, unknown>;
    if ("success" in value || "code" in value || "trace_id" in value) {
      return value.data;
    }
  }
  return body;
}

function backendHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (clientToken) headers["X-Client-Token"] = clientToken;
  if (authSession) {
    headers.Authorization = `${authSession.tokenType || "Bearer"} ${authSession.accessToken}`;
  }
  return headers;
}

function authSessionFromResponse(data: unknown, fallbackUsername?: string): BackendAuthSession {
  if (typeof data !== "object" || data === null) {
    throw new Error("登录响应格式无效。");
  }
  const value = data as Record<string, unknown>;
  const accessToken = typeof value.access_token === "string" ? value.access_token : "";
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw new Error("登录响应缺少有效的访问令牌。");
  }
  const profile = typeof value.user === "object" && value.user !== null
    ? value.user as Record<string, unknown>
    : undefined;
  return {
    accessToken,
    refreshToken,
    tokenType: typeof value.token_type === "string" && value.token_type ? value.token_type : "Bearer",
    userId: typeof profile?.id === "string" ? profile.id : undefined,
    username: typeof profile?.username === "string" ? profile.username : fallbackUsername,
    displayName: typeof profile?.display_name === "string" ? profile.display_name : undefined
  };
}

async function refreshAuthSession(): Promise<boolean> {
  if (!authSession?.refreshToken) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await net.fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          ...(clientToken ? { "X-Client-Token": clientToken } : {}),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: authSession?.refreshToken })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) return false;
      const next = authSessionFromResponse(unwrapBackendBody(body), authSession?.username);
      authSession = next;
      await persistAuthSession();
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function backendFetch(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  await loadAuthSession();
  const request = () => net.fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...backendHeaders(typeof options.body === "string")
    }
  });
  let response = await request();
  if (response.status === 401 && retry && !path.startsWith("/api/v1/auth/")) {
    if (await refreshAuthSession()) {
      response = await request();
      if (response.status === 401) await clearAuthSession();
    } else {
      await clearAuthSession();
    }
  }
  return response;
}

function validateCharacterId(characterId: string): void {
  if (!/^[a-z0-9-]+$/i.test(characterId)) {
    throw new Error("Invalid character id.");
  }
}

export function getRegisteredMusicFile(id: string): string | undefined {
  return registeredMusicFiles.get(id);
}

export async function registerIpcHandlers(): Promise<void> {
  await loadAuthSession();

  ipcMain.handle(
    IPC_CHANNELS.authSession,
    async (): Promise<AuthSession | null> => {
      await loadAuthSession();
      return authSession ? {
        username: authSession.username,
        displayName: authSession.displayName,
        userId: authSession.userId
      } : null;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.authLogin,
    async (_event, credentials: { username: string; password: string }): Promise<AuthSession> => {
      const username = credentials.username.trim();
      if (!username || !credentials.password) {
        throw new Error("请输入账号和密码。");
      }

      let response: Response;
      try {
        response = await net.fetch(`${apiBaseUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: {
            ...(clientToken ? { "X-Client-Token": clientToken } : {}),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ username, password: credentials.password })
        });
      } catch {
        throw new Error("无法连接月薪喵后端，请确认后端已启动。");
      }

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorDetail(body, response.status));
      }
      authSession = authSessionFromResponse(unwrapBackendBody(body), username);
      await persistAuthSession();
      return { username: authSession.username, displayName: authSession.displayName, userId: authSession.userId };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.authRegister,
    async (_event, credentials: { username: string; password: string; displayName?: string }): Promise<AuthSession> => {
      const username = credentials.username.trim();
      if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
        throw new Error("账号需为 3-32 位字母、数字或下划线。");
      }
      if (credentials.password.length < 8) {
        throw new Error("密码至少需要 8 位。");
      }
      let response: Response;
      try {
        response = await net.fetch(`${apiBaseUrl}/api/v1/auth/register`, {
          method: "POST",
          headers: {
            ...(clientToken ? { "X-Client-Token": clientToken } : {}),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username,
            password: credentials.password,
            display_name: credentials.displayName?.trim() || undefined
          })
        });
      } catch {
        throw new Error("无法连接月薪喵后端，请确认后端已启动。");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorDetail(body, response.status));
      }
      authSession = authSessionFromResponse(unwrapBackendBody(body), username);
      await persistAuthSession();
      return { username: authSession.username, displayName: authSession.displayName, userId: authSession.userId };
    }
  );

  ipcMain.handle(IPC_CHANNELS.authLogout, async (): Promise<void> => {
    if (authSession?.accessToken) {
      await backendFetch(`/api/v1/auth/logout`, {
        method: "POST",
      }).catch(() => undefined);
    }
    await clearAuthSession();
  });

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
        response = await backendFetch(`/api/v1/chat/stream`, {
          method: "POST",
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
          throw new Error(streamEvent.detail || streamEvent.message || "模型生成回复失败。");
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
    const response = await backendFetch(`/api/v1/usage`);
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
