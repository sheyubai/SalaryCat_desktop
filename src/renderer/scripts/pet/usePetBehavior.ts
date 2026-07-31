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
      () => setState("sleep", "呼噜…"),
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

  useEffect(() => {
    scheduleSleep();
    return () => {
      window.clearTimeout(idleTimer.current);
      window.clearTimeout(reactionTimer.current);
    };
  }, [scheduleSleep]);

  return { wake };
}
