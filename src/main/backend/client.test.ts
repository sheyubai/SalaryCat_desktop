// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), handle: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock("electron", () => ({
  app: { getPath: () => "/test-profile" }, ipcMain: { handle: mocks.handle }, net: { fetch: mocks.fetch },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() }
}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn().mockRejectedValue(new Error("not found")), writeFile: mocks.writeFile, unlink: mocks.unlink }));
let client: typeof import("./client");
let handlers: Map<string, (...args: any[]) => Promise<any>>;
const tokens = { access_token: "fixture-access", refresh_token: "fixture-refresh", user: { id: "a", username: "alice" } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.writeFile.mockResolvedValue(undefined); mocks.unlink.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(json(tokens));
  client = await import("./client");
  await client.registerAuthHandlers();
  handlers = new Map(mocks.handle.mock.calls.map(([name, handler]) => [name, handler]));
  await handlers.get("auth:login")!({}, { username: "alice", password: "test-password" });
  mocks.fetch.mockReset();
});

it("刷新接口临时离线不删除本机登录状态", async () => {
  mocks.fetch.mockResolvedValueOnce(json({}, 401)).mockRejectedValueOnce(new Error("offline"));
  await expect(client.backendFetch("/api/v1/usage")).rejects.toThrow("无法连接");
  expect(await handlers.get("auth:session")!()).toMatchObject({ userId: "a" });
  expect(mocks.unlink).not.toHaveBeenCalled();
});

it("刷新令牌确定失效后才清除登录状态", async () => {
  mocks.fetch.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 401));
  expect((await client.backendFetch("/api/v1/usage")).status).toBe(401);
  expect(await handlers.get("auth:session")!()).toBeNull();
  expect(mocks.unlink).toHaveBeenCalledOnce();
});

it("退出期间到达的刷新结果不会把用户重新登录", async () => {
  let completeRefresh!: (response: Response) => void;
  mocks.fetch.mockImplementation((url: string) => {
    if (url.endsWith("/refresh")) return new Promise((resolve) => { completeRefresh = resolve; });
    return Promise.resolve(json({}, url.endsWith("/usage") ? 401 : 200));
  });
  const pending = client.backendFetch("/api/v1/usage");
  const result = expect(pending).rejects.toThrow("登录状态已变化");
  await vi.waitFor(() => expect(completeRefresh).toBeTypeOf("function"));
  await handlers.get("auth:logout")!();
  completeRefresh(json(tokens));
  await result;
  expect(await handlers.get("auth:session")!()).toBeNull();
});

it("后端离线仍可退出，不等待远程注销返回", async () => {
  mocks.fetch.mockReturnValue(new Promise(() => undefined));
  await handlers.get("auth:logout")!();
  expect(await handlers.get("auth:session")!()).toBeNull();
});
