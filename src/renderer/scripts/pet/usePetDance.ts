import { useCallback, useEffect, useRef, useState } from "react";

import type { UserMusicSettings } from "../../../shared/contracts";

export type DanceStatus = "loading" | "ready" | "starting" | "playing" | "paused" | "error" | "unavailable";

/** 音乐的实际 playing/pause 事件是跳舞状态和时长的唯一来源。 */
export function usePetDance(settings: UserMusicSettings, themeUrl: string) {
  const [status, setStatus] = useState<DanceStatus>("loading");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const controls = useRef<{ toggle(): void } | null>(null);
  const latestSettings = useRef(settings);
  const retryAndPlay = useRef(false);

  useEffect(() => {
    latestSettings.current = settings;
    if (audio.current) {
      audio.current.volume = settings.volume / 100;
      audio.current.loop = settings.loop;
    }
  }, [settings]);

  useEffect(() => {
    let active = true;
    let player: HTMLAudioElement | null = null;
    let wantsPlayback = false;
    let failed = false;
    let request = 0;
    let startedAt: number | null = null;
    let remainderMs = 0;
    let startTimeout: number | undefined;
    const autoplay = retryAndPlay.current;
    retryAndPlay.current = false;
    setError("");
    setStatus("loading");

    function reportTime(keepPlaying: boolean) {
      const now = performance.now();
      if (startedAt !== null) remainderMs += Math.max(0, now - startedAt);
      startedAt = keepPlaying ? now : null;
      const seconds = Math.floor(remainderMs / 1_000);
      remainderMs -= seconds * 1_000;
      if (seconds > 0) {
        // 统计失败不影响本地播放；不重发未知结果，避免重复记账。
        void window.petAPI.recordUsageActivity("dance", Math.min(seconds, 86_400)).catch(() => undefined);
      }
    }

    function fail(message: string) {
      if (!active) return;
      wantsPlayback = false;
      failed = true;
      request += 1;
      window.clearTimeout(startTimeout);
      reportTime(false);
      player?.pause();
      setError(message);
      setStatus("error");
    }

    function waitForPlayback() {
      window.clearTimeout(startTimeout);
      startTimeout = window.setTimeout(() => fail("音乐加载超时，请重试或在设置中更换文件。"), 15_000);
    }

    function onPlaying() {
      if (!active || !wantsPlayback) {
        player?.pause();
        return;
      }
      window.clearTimeout(startTimeout);
      if (startedAt === null) startedAt = performance.now();
      setError("");
      setStatus("playing");
    }

    function onPause() {
      if (player && !player.paused) return;
      reportTime(false);
      if (!active || failed || player?.ended) return;
      window.clearTimeout(startTimeout);
      wantsPlayback = false;
      setStatus("paused");
    }

    function onWaiting() {
      if (!active || !wantsPlayback) return;
      reportTime(false);
      setStatus("starting");
      waitForPlayback();
    }

    function onEnded() {
      reportTime(false);
      if (!active) return;
      wantsPlayback = false;
      window.clearTimeout(startTimeout);
      setStatus("ready");
    }

    function onError() {
      fail("音乐无法播放，请检查文件是否存在、格式是否支持，或在设置中更换音乐。");
    }

    function toggle() {
      if (!active || !player) return;
      request += 1;
      const currentRequest = request;
      if (wantsPlayback) {
        wantsPlayback = false;
        window.clearTimeout(startTimeout);
        reportTime(false);
        player.pause();
        setStatus("paused");
        return;
      }
      wantsPlayback = true;
      failed = false;
      if (player.ended) player.currentTime = 0;
      setStatus("starting");
      waitForPlayback();
      void player.play().catch(() => {
        if (active && currentRequest === request && wantsPlayback) onError();
      });
    }

    async function load() {
      const loadRequest = request;
      waitForPlayback();
      try {
        const url = settings.sourcePath
          ? await window.petAPI.getMusicUrl(settings.sourcePath)
          : themeUrl;
        if (!active || request !== loadRequest) return;
        window.clearTimeout(startTimeout);
        if (!url) { setStatus("unavailable"); return; }
        player = new Audio(url);
        player.preload = "metadata";
        player.volume = latestSettings.current.volume / 100;
        player.loop = latestSettings.current.loop;
        player.addEventListener("playing", onPlaying);
        player.addEventListener("pause", onPause);
        player.addEventListener("waiting", onWaiting);
        player.addEventListener("ended", onEnded);
        player.addEventListener("error", onError);
        audio.current = player;
        controls.current = { toggle };
        setStatus("ready");
        if (autoplay) toggle();
      } catch {
        fail("找不到这首音乐，请重新选择文件。移除自选音乐可恢复角色音乐。");
      }
    }

    void load();
    // 循环播放也会定期结算；暂停、缓冲和失败时间不计入跳舞时长。
    const checkpoint = window.setInterval(() => {
      if (startedAt !== null) reportTime(true);
    }, 30_000);
    const onPageHide = () => {
      wantsPlayback = false;
      reportTime(false);
      player?.pause();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      active = false;
      request += 1;
      wantsPlayback = false;
      window.clearInterval(checkpoint);
      window.clearTimeout(startTimeout);
      window.removeEventListener("pagehide", onPageHide);
      reportTime(false);
      if (player) {
        player.removeEventListener("playing", onPlaying);
        player.removeEventListener("pause", onPause);
        player.removeEventListener("waiting", onWaiting);
        player.removeEventListener("ended", onEnded);
        player.removeEventListener("error", onError);
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
      audio.current = null;
      controls.current = null;
    };
  }, [settings.sourcePath, themeUrl, revision]);

  const toggle = useCallback(() => {
    if (status === "error") {
      retryAndPlay.current = true;
      setRevision((value) => value + 1);
    } else {
      controls.current?.toggle();
    }
  }, [status]);

  return {
    status,
    playing: status === "playing",
    error,
    trackName: settings.sourcePath.split(/[\\/]/).pop() || "角色音乐",
    toggle
  };
}
