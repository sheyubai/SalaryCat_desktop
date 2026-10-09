import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatResponse, PetAPI, UserBehaviorSettings } from "../../../shared/contracts";
import { usePetBehavior } from "./usePetBehavior";
import { usePetChat } from "./usePetChat";
import { usePetStore } from "./petStore";

const defaults: UserBehaviorSettings = {
  sleepAfterSeconds: 10,
  dismissAfterSeconds: 5,
  sleepMessages: ["睡觉啦"]
};
const reply: ChatResponse = { conversationId: "conversation-1", messageId: "message-1", answer: "你好呀" };
const send = vi.fn<PetAPI["sendChatMessage"]>();
let root: Root;
let container: HTMLDivElement;
let current: ReturnType<typeof usePetBehavior> & ReturnType<typeof usePetChat>;

function Harness({ settings, dancing }: { settings: UserBehaviorSettings; dancing: boolean }) {
  const behavior = usePetBehavior(settings, dancing);
  current = { ...behavior, ...usePetChat(behavior) };
  return null;
}

function render(settings = defaults, dancing = false) {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness, { settings, dancing }))));
}

function deferredReply() {
  let resolve!: (value: ChatResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ChatResponse>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function start(message = "你好") {
  let pending!: Promise<boolean>;
  act(() => { pending = current.sendMessage(message); });
  return pending;
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

function expectPet(state: string, message: string) {
  expect(usePetStore.getState()).toMatchObject({ state, message });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  send.mockReset();
  vi.stubGlobal("petAPI", { sendChatMessage: send, cancelChatMessage: vi.fn() } satisfies Pick<PetAPI, "sendChatMessage" | "cancelChatMessage">);
  usePetStore.getState().setState("idle");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("聊天与桌宠行为", () => {
  it("停止保留已输出文字，允许立即重发，旧请求不能覆盖新回答", async () => {
    const deferred = deferredReply();
    send.mockReturnValueOnce(deferred.promise).mockResolvedValue(reply);
    const pending = start();
    act(() => send.mock.calls[0][1]?.("半句"));
    act(() => current.stop());
    expect(window.petAPI.cancelChatMessage).toHaveBeenCalledTimes(1);
    expect(current.sending).toBe(false);
    expect(usePetStore.getState().message).toContain("半句");
    await act(async () => { await current.sendMessage("新问题"); });
    await act(async () => { deferred.resolve({ ...reply, answer: "旧回答" }); await pending; });
    expectPet("happy", reply.answer);
  });

  it("开始新对话清空会话 ID", async () => {
    send.mockResolvedValue(reply);
    await act(async () => { await current.sendMessage("第一轮"); });
    act(() => current.newConversation());
    await act(async () => { await current.sendMessage("新话题"); });
    expect(send.mock.calls[1][0].conversationId).toBeUndefined();
  });

  it("流式失败保留部分回答，返回失败供输入框保留草稿", async () => {
    const deferred = deferredReply();
    send.mockReturnValue(deferred.promise);
    const pending = start();
    act(() => send.mock.calls[0][1]?.("已经收到的文字"));
    await act(async () => { deferred.reject(new Error("连接中断")); expect(await pending).toBe(false); });
    expect(usePetStore.getState().message).toContain("已经收到的文字");
    expect(usePetStore.getState().message).toContain("连接中断");
  });
  it("跳舞会唤醒休眠，暂停后才重新开始空闲计时", () => {
    advance(10_000);
    expectPet("sleep", "睡觉啦");
    render(defaults, true);
    advance(60_000);
    expectPet("idle", "");
    act(() => current.wake());
    advance(60_000);
    expectPet("idle", "");
    render(defaults, false);
    advance(9_999);
    expectPet("idle", "");
    advance(1);
    expectPet("sleep", "睡觉啦");
  });

  it("开始或暂停跳舞不会清除正在输出和已完成的聊天回复", async () => {
    const deferred = deferredReply();
    send.mockReturnValue(deferred.promise);
    const pending = start();
    render(defaults, true);
    expectPet("thinking", "让本喵想想哦...");
    act(() => send.mock.calls[0][1]?.("你好"));
    render(defaults, false);
    advance(60_000);
    expectPet("happy", "你好");
    await act(async () => { deferred.resolve(reply); await pending; });
    render(defaults, true);
    render(defaults, false);
    advance(60_000);
    expectPet("happy", reply.answer);
  });

  it("慢回复不会被原有休眠计时器覆盖", async () => {
    const deferred = deferredReply();
    send.mockReturnValue(deferred.promise);
    advance(9_000);
    const pending = start();
    advance(60_000);
    expectPet("thinking", "让本喵想想哦...");
    expect(current.sending).toBe(true);
    await act(async () => { deferred.resolve(reply); await pending; });
    expectPet("happy", reply.answer);
    expect(current.sending).toBe(false);
  });

  it("互动恢复计时器、点击和关闭气泡不会打断正在输出的回答", async () => {
    const deferred = deferredReply();
    send.mockReturnValue(deferred.promise);
    act(() => current.wake("摸摸", 1_800));
    const pending = start();
    act(() => send.mock.calls[0][1]?.("你"));
    advance(2_000);
    act(() => { current.wake("音乐提示"); current.dismissMessage(); });
    expectPet("happy", "你");
    act(() => send.mock.calls[0][1]?.("好呀"));
    expectPet("happy", "你好呀");
    await act(async () => { deferred.resolve(reply); await pending; });
  });

  it("更新设置不打断聊天和待阅读回复，关闭回复后采用新休眠时间", async () => {
    const deferred = deferredReply();
    send.mockReturnValue(deferred.promise);
    const pending = start();
    render({ ...defaults, sleepAfterSeconds: 20 });
    advance(60_000);
    expectPet("thinking", "让本喵想想哦...");
    await act(async () => { deferred.resolve(reply); await pending; });
    render({ ...defaults, sleepAfterSeconds: 30, sleepMessages: ["新的睡眠提示"] });
    advance(60_000);
    expectPet("happy", reply.answer);
    act(() => current.dismissMessage());
    advance(29_999);
    expectPet("idle", "");
    advance(1);
    expectPet("sleep", "新的睡眠提示");
  });

  it("拒绝空消息和同一轮渲染内的重复提交，后续消息续传会话 ID", async () => {
    const deferred = deferredReply();
    send.mockReturnValueOnce(deferred.promise).mockResolvedValue(reply);
    let pending!: Promise<boolean>;
    act(() => {
      void current.sendMessage("   ");
      pending = current.sendMessage("  你好  ");
      void current.sendMessage("重复消息");
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ message: "你好", conversationId: undefined });
    await act(async () => { deferred.resolve(reply); await pending; });
    await act(async () => { await current.sendMessage("再聊一句"); });
    expect(send.mock.calls[1][0]).toEqual({ message: "再聊一句", conversationId: reply.conversationId });
  });

  it("请求失败后显示可读错误、释放提交锁，并在提示关闭后恢复休眠", async () => {
    send.mockRejectedValueOnce(new Error("Error invoking remote method 'chat:send': Error: 服务暂时不可用"));
    await act(async () => { await current.sendMessage("你好"); });
    expectPet("happy", "服务暂时不可用");
    expect(current.sending).toBe(false);
    act(() => current.dismissMessage());
    advance(10_000);
    expectPet("sleep", "睡觉啦");
    send.mockResolvedValue(reply);
    await act(async () => { await current.sendMessage("重试"); });
    expectPet("happy", reply.answer);
  });

  it("卸载后清理计时器并忽略迟到的回复", async () => {
    const deferred = deferredReply();
    send.mockReturnValue(deferred.promise);
    const pending = start();
    act(() => root.unmount());
    usePetStore.getState().setState("idle");
    act(() => send.mock.calls[0][1]?.("迟到的文字"));
    await act(async () => { deferred.resolve(reply); await pending; });
    advance(60_000);
    expectPet("idle", "");
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });

  it("普通互动结束后仍会恢复空闲和休眠，设置更新不会卡住互动状态", () => {
    act(() => current.wake("摸摸", 1_800));
    render({ ...defaults, sleepAfterSeconds: 20 });
    advance(1_800);
    expectPet("idle", "");
    advance(20_000);
    expectPet("sleep", "睡觉啦");
  });
});
