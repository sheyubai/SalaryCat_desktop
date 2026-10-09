import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PetSprite } from "./PetSprite";

let root: Root;
let host: HTMLDivElement;
let reduced = false;
let media: EventTarget;
const drawImage = vi.fn();
function render(src = "cat.GIF") {
  act(() => root.render(createElement(PetSprite, { src, name: "月薪喵" })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reduced = false;
  media = new EventTarget();
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reduced; },
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media)
  }));
  drawImage.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(240);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(240);
  host = document.createElement("div");
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("默认持续显示 GIF，父组件重渲染不会冻结或替换图片节点", () => {
  render();
  const image = host.querySelector("img");
  render();
  expect(host.querySelector("img")?.style.visibility).toBe("visible");
  expect(host.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  expect(host.querySelector("img")).toBe(image);
  expect(drawImage).not.toHaveBeenCalled();
});

it("遵循系统减少动态效果设置，切换偏好无需重新载入角色", () => {
  render();
  act(() => { reduced = true; media.dispatchEvent(new Event("change")); });
  expect(host.querySelector("canvas")?.style.visibility).toBe("visible");
  act(() => { reduced = false; media.dispatchEvent(new Event("change")); });
  expect(host.querySelector("img")?.style.visibility).toBe("visible");
});

it("新素材加载完成后更新静止画布，不继续显示旧角色姿势", () => {
  reduced = true;
  render();
  render("another-cat.gif");
  act(() => host.querySelector("img")!.dispatchEvent(new Event("load")));
  expect(drawImage.mock.calls.at(-1)?.[0]).toBe(host.querySelector("img"));
  expect(host.querySelector("img")?.getAttribute("src")).toBe("another-cat.gif");
  expect(host.querySelector("canvas")?.style.visibility).toBe("visible");
});
