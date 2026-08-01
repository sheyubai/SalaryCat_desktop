import { useCallback, useEffect, useRef } from "react";

import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import { usePetStore } from "./petStore";

export function usePetBehavior() {
  const setState = usePetStore((store) => store.setState);
  const idleTimer = useRef<number | undefined>(undefined);
  const reactionTimer = useRef<number | undefined>(undefined);

  const scheduleSleep = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(
      () => {
        const messages = DEFAULT_CONFIG.behavior.sleepMessages;
        const message = messages[Math.floor(Math.random() * messages.length)];
        setState("sleep", message);
      },
      DEFAULT_CONFIG.behavior.sleepAfterMs
    );
  }, [setState]);

  const wake = useCallback((message = "", durationMs: number = DEFAULT_CONFIG.behavior.happyDurationMs) => {
    setState("happy", message);
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => {
      setState("idle");
      scheduleSleep();
    }, durationMs);
  }, [scheduleSleep, setState]);

  const showPersistentMessage = useCallback((message: string) => {
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(reactionTimer.current);
    setState("happy", message);
  }, [setState]);

  const dismissMessage = useCallback(() => {
    window.clearTimeout(reactionTimer.current);
    setState("idle");
    scheduleSleep();
  }, [scheduleSleep, setState]);

  useEffect(() => {
    scheduleSleep();
    return () => {
      window.clearTimeout(idleTimer.current);
      window.clearTimeout(reactionTimer.current);
    };
  }, [scheduleSleep]);

  return { wake, showPersistentMessage, dismissMessage };
}
