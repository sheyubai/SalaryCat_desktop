import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PetChatInput } from "./PetChatInput";

let container: HTMLDivElement;
let root: Root;
const send = vi.fn();
const stop = vi.fn();
function render(disabled = false) {
  act(() => root.render(createElement(PetChatInput, { onSend: send, onStop: stop, onNewConversation: vi.fn(), disabled })));
}
function input(value: string) {
  act(() => {
    const element = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  send.mockReset(); stop.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("失败保留草稿，成功后清空", async () => {
  input("再试一次");
  send.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await submit();
  expect(container.querySelector("input")!.value).toBe("再试一次");
  await submit();
  expect(container.querySelector("input")!.value).toBe("");
});

it("中文组词过程中不发送，组词完成后才接受提交", async () => {
  input("你好");
  act(() => container.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await submit();
  expect(send).not.toHaveBeenCalled();
  act(() => container.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  send.mockResolvedValue(true);
  await submit();
  expect(send).toHaveBeenCalledWith("你好");
});

it("生成中仍可点击停止，并禁止再次提交", async () => {
  input("问题"); render(true);
  await submit(); expect(send).not.toHaveBeenCalled();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="停止生成"]')!.click());
  expect(stop).toHaveBeenCalledOnce();
});
