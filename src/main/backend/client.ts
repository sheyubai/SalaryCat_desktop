import { app, ipcMain, net, safeStorage } from "electron";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IPC_CHANNELS, type AuthSession } from "../../shared/contracts";

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
let authRevision = 0;
let sessionWrite: Promise<void> = Promise.resolve();

function fetchBackend(url: string, options: RequestInit = {}): Promise<Response> {
  const signal = options.signal ?? AbortSignal.timeout(30_000);
  return net.fetch(url, { ...options, signal }).catch((error: unknown) => {
    if (signal.aborted) throw new Error("请求超时或已取消，请稍后重试。");
    throw new Error("无法连接月薪喵后端，请确认后端已启动。", { cause: error });
  });
}

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
  sessionWrite = sessionWrite.catch(() => undefined).then(() => writeFile(authSessionPath(), encrypted, "utf8"));
  await sessionWrite;
}

async function clearAuthSession(): Promise<void> {
  authRevision++;
  authSession = null;
  authSessionLoaded = true;
  sessionWrite = sessionWrite.catch(() => undefined).then(() => unlink(authSessionPath()).catch(() => undefined));
  await sessionWrite;
}

export function errorDetail(body: unknown, status: number): string {
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

export function unwrapBackendBody(body: unknown): unknown {
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
  const previous = authSession;
  refreshPromise = (async () => {
    try {
      const response = await fetchBackend(`${apiBaseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          ...(clientToken ? { "X-Client-Token": clientToken } : {}),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: previous.refreshToken })
      });
      const body = await response.json().catch(() => null);
      if (authSession !== previous) throw new Error("登录状态已变化，请重新操作。");
      if (response.status === 401 || response.status === 403) return false;
      if (!response.ok) throw new Error(errorDetail(body, response.status));
      if (authSession !== previous) throw new Error("登录状态已变化，请重新操作。");
      const next = authSessionFromResponse(unwrapBackendBody(body), previous.username);
      authSession = next;
      await persistAuthSession();
      return true;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function backendFetch(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  await loadAuthSession();
  const revision = authRevision;
  const request = () => fetchBackend(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...backendHeaders(typeof options.body === "string")
    }
  });
  let response = await request();
  if (revision !== authRevision) throw new Error("登录状态已变化，请重新操作。");
  if (response.status === 401 && retry && !path.startsWith("/api/v1/auth/")) {
    if (await refreshAuthSession()) {
      response = await request();
      if (revision !== authRevision) throw new Error("登录状态已变化，请重新操作。");
      if (response.status === 401) await clearAuthSession();
    } else {
      await clearAuthSession();
    }
  }
  return response;
}

export async function registerAuthHandlers(): Promise<void> {
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
      const revision = authRevision;
      const username = credentials.username.trim();
      if (!username || !credentials.password) {
        throw new Error("请输入账号和密码。");
      }

      let response: Response;
      try {
        response = await fetchBackend(`${apiBaseUrl}/api/v1/auth/login`, {
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
      if (revision !== authRevision) throw new Error("登录状态已变化，请重新操作。");
      authSession = authSessionFromResponse(unwrapBackendBody(body), username);
      authRevision++;
      await persistAuthSession();
      return { username: authSession.username, displayName: authSession.displayName, userId: authSession.userId };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.authRegister,
    async (_event, credentials: { username: string; password: string; displayName?: string }): Promise<AuthSession> => {
      const revision = authRevision;
      const username = credentials.username.trim();
      if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
        throw new Error("账号需为 3-32 位字母、数字或下划线。");
      }
      if (credentials.password.length < 8) {
        throw new Error("密码至少需要 8 位。");
      }
      let response: Response;
      try {
        response = await fetchBackend(`${apiBaseUrl}/api/v1/auth/register`, {
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
      if (revision !== authRevision) throw new Error("登录状态已变化，请重新操作。");
      authSession = authSessionFromResponse(unwrapBackendBody(body), username);
      authRevision++;
      await persistAuthSession();
      return { username: authSession.username, displayName: authSession.displayName, userId: authSession.userId };
    }
  );

  ipcMain.handle(IPC_CHANNELS.authLogout, async (): Promise<void> => {
    const headers = backendHeaders();
    const hadSession = authSession !== null;
    await clearAuthSession();
    if (hadSession) {
      void fetchBackend(`${apiBaseUrl}/api/v1/auth/logout`, { method: "POST", headers }).catch(() => undefined);
    }
  });

}
