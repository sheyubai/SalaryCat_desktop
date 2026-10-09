// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readChatStream } from "./chatStream";

const start = { type: "start", conversation_id: "c", message_id: "m" };
const end = { ...start, type: "done" };
function response(events: unknown[]) { return new Response(events.map((value) => JSON.stringify(value)).join("\n")); }

describe("后端聊天数据流", () => {
  it("正确解码跨网络分片的中文和没有尾换行的完成事件", async () => {
    const bytes = new TextEncoder().encode([start, { type: "delta", text: "你好🐱" }, end].map((value) => JSON.stringify(value)).join("\r\n"));
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } });
    const delta = vi.fn();
    expect(await readChatStream(new Response(stream), delta)).toEqual({ conversationId: "c", messageId: "m", answer: "你好🐱" });
    expect(delta).toHaveBeenCalledWith("你好🐱");
  });

  it("开始事件不能证明回复成功，断流必须报错", async () => {
    await expect(readChatStream(response([start, { type: "delta", text: "半句" }]), vi.fn())).rejects.toThrow("连接中断");
  });

  it("服务端错误保留可读原因", async () => {
    await expect(readChatStream(response([start, { type: "error", detail: "模型额度不足" }]), vi.fn())).rejects.toThrow("模型额度不足");
  });

  it("空回复和损坏协议不算成功", async () => {
    await expect(readChatStream(response([start, end]), vi.fn())).rejects.toThrow("没有返回文字");
    await expect(readChatStream(new Response("not-json\n"), vi.fn())).rejects.toThrow("格式异常");
  });
});
