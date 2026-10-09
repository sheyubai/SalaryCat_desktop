// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerChatHandlers } from "./chatHandlers";
import { backendFetch } from "../backend/client";

const ipc = vi.hoisted(() => ({ handle: vi.fn(), on: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: ipc }));
vi.mock("../backend/client", () => ({ backendFetch: vi.fn(), errorDetail: () => "后端错误" }));
let send: (event: any, payload: any) => Promise<unknown>;
let cancel: (event: any, id: string) => void;

function sender(id: number) {
  return Object.assign(new EventEmitter(), { id, isDestroyed: () => false, send: vi.fn() });
}
beforeEach(() => {
  vi.clearAllMocks();
  registerChatHandlers();
  send = ipc.handle.mock.calls[0][1];
  cancel = ipc.on.mock.calls[0][1];
});
afterEach(() => vi.useRealTimers());

it("请求达到截止时间会释放输入等待并返回明确提示", async () => {
  const timeout = new AbortController();
  const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
  try {
    vi.mocked(backendFetch).mockImplementation((_path, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = send({ sender: sender(1) }, { requestId: "r1", request: { message: "hello" } });
    const result = expect(pending).rejects.toThrow("超过两分钟");
    expect(timeoutSpy).toHaveBeenCalledWith(120_000);
    timeout.abort();
    await result;
  } finally { timeoutSpy.mockRestore(); }
});

it("取消仅能中断发送窗口自己的请求，并释放销毁监听", async () => {
  let signal!: AbortSignal;
  vi.mocked(backendFetch).mockImplementation((_path, options) => new Promise((_resolve, reject) => {
    signal = options!.signal as AbortSignal;
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  const own = sender(1);
  const other = sender(2);
  const pending = send({ sender: own }, { requestId: "r1", request: { message: "hello" } });
  const result = expect(pending).rejects.toThrow("已停止生成");
  cancel({ sender: other }, "r1");
  expect(signal.aborted).toBe(false);
  cancel({ sender: own }, "stale-request");
  expect(signal.aborted).toBe(false);
  cancel({ sender: own }, "r1");
  await result;
  expect(own.listenerCount("destroyed")).toBe(0);
});

it("窗口销毁会取消仍在等待的网络请求", async () => {
  vi.mocked(backendFetch).mockImplementation((_path, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  const own = sender(1);
  const pending = send({ sender: own }, { requestId: "r1", request: { message: "hello" } });
  const result = expect(pending).rejects.toThrow("已停止生成");
  own.emit("destroyed");
  await result;
});

it("完成后返回整段回答并按请求 ID 分发增量", async () => {
  vi.mocked(backendFetch).mockResolvedValue(new Response([
    { type: "start", conversation_id: "c", message_id: "m" },
    { type: "delta", text: "你好" }, { type: "done", conversation_id: "c", message_id: "m" }
  ].map((value) => JSON.stringify(value)).join("\n")));
  const own = sender(1);
  expect(await send({ sender: own }, { requestId: "r1", request: { message: "hello" } })).toMatchObject({ answer: "你好" });
  expect(own.send).toHaveBeenCalledWith("chat:delta", { requestId: "r1", text: "你好" });
  expect(own.listenerCount("destroyed")).toBe(0);
});
