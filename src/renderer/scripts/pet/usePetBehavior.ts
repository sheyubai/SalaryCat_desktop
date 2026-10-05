import { useCallback, useEffect, useRef } from "react";

import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import type { UserBehaviorSettings } from "../../../shared/contracts";
import { usePetStore } from "./petStore";

export function usePetBehavior(behavior: UserBehaviorSettings, dancing = false) {
  const setState = usePetStore((store) => store.setState);
  const idleTimer = useRef<number | undefined>(undefined);
  const reactionTimer = useRef<number | undefined>(undefined);
  // 动画无法区分“互动开心”和“正在输出回答”，单独记录行为阶段。
  const phase = useRef<"idle" | "reaction" | "chat" | "message">("idle");
  const settings = useRef(behavior);
  const danceActive = useRef(dancing);

  const clearTimers = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(reactionTimer.current);
  }, []);

  const scheduleSleep = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    if (phase.current !== "idle" || danceActive.current) return;
    idleTimer.current = window.setTimeout(
      () => {
        if (phase.current !== "idle" || danceActive.current) return;
        const messages = settings.current.sleepMessages.length
          ? settings.current.sleepMessages
          : DEFAULT_CONFIG.behavior.sleepMessages;
        const message = messages[Math.floor(Math.random() * messages.length)];
        setState("sleep", message);
      },
      settings.current.sleepAfterSeconds * 1_000
    );
  }, [setState]);

  const wake = useCallback((message = "", durationMs: number = DEFAULT_CONFIG.behavior.happyDurationMs) => {
    // 聊天期间仍可开菜单和拖动，但互动提示不能覆盖回答。
    if (phase.current === "chat") return;
    clearTimers();
    phase.current = "reaction";
    setState("happy", message);
    reactionTimer.current = window.setTimeout(() => {
      if (phase.current !== "reaction") return;
      phase.current = "idle";
      setState("idle");
      scheduleSleep();
    }, durationMs);
  }, [clearTimers, scheduleSleep, setState]);

  const beginChat = useCallback(() => {
    clearTimers();
    phase.current = "chat";
    setState("thinking", "让本喵想想哦...");
  }, [clearTimers, setState]);

  const updateChat = useCallback((message: string) => {
    if (phase.current === "chat") setState("happy", message);
  }, [setState]);

  const finishChat = useCallback((message: string) => {
    clearTimers();
    phase.current = "message";
    setState("happy", message);
  }, [clearTimers, setState]);

  const dismissMessage = useCallback(() => {
    if (phase.current === "chat") return;
    clearTimers();
    phase.current = "idle";
    setState("idle");
    scheduleSleep();
  }, [clearTimers, scheduleSleep, setState]);

  useEffect(() => {
    settings.current = behavior;
    // 配置更新只调整空闲计时，不打断聊天或待阅读的回复。
    if (phase.current === "idle") scheduleSleep();
  }, [behavior, scheduleSleep]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    danceActive.current = dancing;
    window.clearTimeout(idleTimer.current);
    if (phase.current === "idle") {
      // 跳舞唤醒睡着的小猫；聊天和待阅读的回复继续保留。
      if (dancing) setState("idle");
      else scheduleSleep();
    }
  }, [dancing, scheduleSleep, setState]);

  return { wake, beginChat, updateChat, finishChat, dismissMessage };
}
