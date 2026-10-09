import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PetAPI, UserMusicSettings } from "../../../shared/contracts";
import { usePetDance } from "./usePetDance";

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  volume = 1;
  loop = false;
  preload = "";
  paused = true;
  ended = false;
  currentTime = 0;
  play = vi.fn((): Promise<void> => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event("pause")); });
  load = vi.fn();
  removeAttribute = vi.fn();
  constructor(public src: string) { super(); FakeAudio.instances.push(this); }
  emit(type: string) {
    if (type === "playing") this.paused = false;
    if (type === "ended") { this.paused = true; this.ended = true; }
    this.dispatchEvent(new Event(type));
  }
}

const settings: UserMusicSettings = { sourcePath: "", volume: 70, loop: true };
const getMusicUrl = vi.fn<PetAPI["getMusicUrl"]>();
const recordUsageActivity = vi.fn<PetAPI["recordUsageActivity"]>();
let root: Root;
let element: HTMLDivElement;
let current: ReturnType<typeof usePetDance>;
const player = () => FakeAudio.instances.at(-1)!;

function Harness({ music, theme }: { music: UserMusicSettings; theme: string }) {
  current = usePetDance(music, theme);
  return null;
}

async function render(music = settings, theme = "salary-cat://asset/music.mp3") {
  await act(async () => root.render(createElement(StrictMode, null, createElement(Harness, { music, theme }))));
}
async function toggle() { await act(async () => current.toggle()); }
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }
function emit(type: string) { act(() => player().emit(type)); }
async function play() { await toggle(); emit("playing"); }
const totalSeconds = () => recordUsageActivity.mock.calls.reduce((sum, call) => sum + call[1], 0);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("petAPI", { getMusicUrl, recordUsageActivity });
  FakeAudio.instances = [];
  getMusicUrl.mockReset().mockResolvedValue("salary-cat://music/custom");
  recordUsageActivity.mockReset().mockResolvedValue(undefined);
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await render();
});

afterEach(() => {
  act(() => root.unmount());
  element.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("音乐与跳舞生命周期", () => {
  it("不自动播放，首次播放应用保存的音量和循环设置", async () => {
    expect(current.status).toBe("ready");
    expect(player().play).not.toHaveBeenCalled();
    expect(player()).toMatchObject({ volume: .7, loop: true });
    await toggle();
    expect(current.status).toBe("starting");
    expect(current.playing).toBe(false);
    advance(2_000);
    expect(recordUsageActivity).not.toHaveBeenCalled();
    emit("playing");
    expect(current.playing).toBe(true);
  });

  it("暂停后从当前位置继续，重复 playing 事件不会重置计时", async () => {
    await play();
    advance(2_500);
    emit("playing");
    advance(2_500);
    player().currentTime = 5;
    await toggle();
    expect(current.status).toBe("paused");
    expect(totalSeconds()).toBe(5);
    advance(60_000);
    expect(totalSeconds()).toBe(5);
    await play();
    expect(player().currentTime).toBe(5);
    advance(3_000);
    await toggle();
    expect(totalSeconds()).toBe(8);
  });

  it("循环播放每 30 秒结算，暂停时补齐尾段且不重复统计", async () => {
    await play();
    advance(65_250);
    expect(totalSeconds()).toBe(60);
    await toggle();
    expect(totalSeconds()).toBe(65);
    emit("pause");
    expect(totalSeconds()).toBe(65);
    await play();
    advance(750);
    await toggle();
    expect(totalSeconds()).toBe(66);
  });

  it("缓冲期间停止动画与计时，恢复后继续计时", async () => {
    await play();
    advance(3_000);
    emit("waiting");
    expect(current.status).toBe("starting");
    expect(totalSeconds()).toBe(3);
    advance(10_000);
    emit("playing");
    advance(2_000);
    await toggle();
    expect(totalSeconds()).toBe(5);
  });

  it("自然结束恢复开始按钮，再次播放从头开始", async () => {
    await render({ ...settings, loop: false });
    await play();
    advance(4_000);
    player().currentTime = 4;
    emit("ended");
    expect(current.status).toBe("ready");
    expect(totalSeconds()).toBe(4);
    await toggle();
    expect(player().currentTime).toBe(0);
  });

  it("快速开始再取消，迟到的 playing 和旧请求失败都不会重新开舞", async () => {
    let reject!: (error: Error) => void;
    player().play.mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
    await toggle();
    await toggle();
    emit("playing");
    expect(player().paused).toBe(true);
    await act(async () => reject(new Error("interrupted")));
    expect(current.status).toBe("paused");
    expect(current.error).toBe("");
    expect(totalSeconds()).toBe(0);
  });

  it("播放失败保留错误，重试创建新播放器并成功恢复", async () => {
    player().play.mockRejectedValueOnce(new Error("unsupported"));
    await toggle();
    emit("pause");
    expect(current.status).toBe("error");
    expect(current.error).toContain("无法播放");
    const oldPlayer = player();
    await toggle();
    expect(player()).not.toBe(oldPlayer);
    expect(player().play).toHaveBeenCalledOnce();
    emit("playing");
    expect(current.error).toBe("");
    expect(current.playing).toBe(true);
  });

  it("等待实际播放超过 15 秒提示错误且不统计等待时间", async () => {
    await toggle();
    advance(15_000);
    expect(current.status).toBe("error");
    expect(current.error).toContain("超时");
    expect(player().paused).toBe(true);
    expect(totalSeconds()).toBe(0);
  });

  it("文件解析超时后，迟到的路径结果不能覆盖错误或自动开舞", async () => {
    let resolve!: (value: string) => void;
    getMusicUrl.mockImplementationOnce(() => new Promise((ok) => { resolve = ok; }));
    await render({ ...settings, sourcePath: "slow.mp3" });
    const count = FakeAudio.instances.length;
    advance(15_000);
    expect(current.status).toBe("error");
    await act(async () => resolve("salary-cat://music/late"));
    expect(current.status).toBe("error");
    expect(FakeAudio.instances).toHaveLength(count);
  });

  it("音量和循环更新不重建播放器、不丢失播放位置", async () => {
    await play();
    player().currentTime = 8;
    const oldPlayer = player();
    await render({ ...settings, volume: 0, loop: false });
    expect(player()).toBe(oldPlayer);
    expect(player()).toMatchObject({ currentTime: 8, volume: 0, loop: false });
    expect(current.playing).toBe(true);
  });

  it("切换文件结算并停止旧曲，不自动播放新曲；移除文件恢复角色音乐", async () => {
    await play();
    advance(4_000);
    const oldPlayer = player();
    await render({ ...settings, sourcePath: "E:\\Music\\new.mp3" });
    expect(totalSeconds()).toBe(4);
    expect(oldPlayer.paused).toBe(true);
    expect(player().src).toBe("salary-cat://music/custom");
    expect(player().play).not.toHaveBeenCalled();
    expect(current.trackName).toBe("new.mp3");
    act(() => oldPlayer.emit("playing"));
    expect(current.status).toBe("ready");
    await render();
    expect(player().src).toBe("salary-cat://asset/music.mp3");
  });

  it("自选文件失效时明确报错，不偷偷回退到别的音乐", async () => {
    getMusicUrl.mockRejectedValueOnce(new Error("ENOENT"));
    await render({ ...settings, sourcePath: "missing.mp3" });
    expect(current.status).toBe("error");
    expect(current.error).toContain("找不到");
    await toggle();
    expect(player().src).toBe("salary-cat://music/custom");
    emit("playing");
    expect(current.playing).toBe(true);
  });

  it("较早的文件解析结果不会覆盖后来选择的文件", async () => {
    let resolve!: (url: string) => void;
    getMusicUrl.mockImplementationOnce(() => new Promise<string>((ok) => { resolve = ok; }));
    await render({ ...settings, sourcePath: "old.mp3" });
    expect(current.status).toBe("loading");
    await render({ ...settings, sourcePath: "new.mp3" });
    await act(async () => resolve("salary-cat://music/old"));
    expect(player().src).toBe("salary-cat://music/custom");
    expect(current.trackName).toBe("new.mp3");
  });

  it("关闭窗口结算尾段并清理音频与计时器，pagehide 不会重复统计", async () => {
    await play();
    advance(4_000);
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(totalSeconds()).toBe(4);
    act(() => root.unmount());
    expect(totalSeconds()).toBe(4);
    expect(player().paused).toBe(true);
    expect(player().removeAttribute).toHaveBeenCalledWith("src");
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(element);
  });

  it("后端统计失败不打断本地跳舞", async () => {
    recordUsageActivity.mockRejectedValue(new Error("offline"));
    await play();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(current.playing).toBe(true);
    await toggle();
    expect(current.status).toBe("paused");
  });

  it("没有角色音乐也没有自选文件时保持不可播放状态", async () => {
    await render(settings, "");
    expect(current.status).toBe("unavailable");
    await toggle();
    expect(current.status).toBe("unavailable");
  });
});
