import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PetSpeechBubble } from "./PetSpeechBubble";

let container: HTMLDivElement;
let root: Root;
const dismiss = vi.fn();
function render(message: string, streaming = false) {
  act(() => root.render(createElement(PetSpeechBubble, { message, streaming, dismissAfterMs: 1000, onDismiss: dismiss })));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  dismiss.mockReset(); container = document.createElement("div"); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("用户上翻时增量不抢滚动位置，生成结束也不跳回顶部", () => {
  render("第一段", true);
  const content = container.querySelector<HTMLElement>(".speech-bubble-content")!;
  Object.defineProperties(content, { scrollHeight: { value: 500, configurable: true }, clientHeight: { value: 100 } });
  content.scrollTop = 120;
  act(() => content.dispatchEvent(new Event("scroll")));
  render("第一段\n\n第二段", true);
  expect(content.scrollTop).toBe(120);
  render("第一段\n\n第二段", false);
  expect(content.scrollTop).toBe(120);
});

it("鼠标留在回复上时，流式结束不能启动自动消失计时", () => {
  render("第一段", true);
  const bubble = container.querySelector("aside")!;
  act(() => bubble.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  render("完整回复", false);
  act(() => vi.advanceTimersByTime(2000));
  expect(dismiss).not.toHaveBeenCalled();
  act(() => bubble.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
  act(() => vi.advanceTimersByTime(1000));
  expect(dismiss).toHaveBeenCalledOnce();
});
