import { useEffect, useRef, useState } from "react";

import type {
  CharacterManifest,
  WindowPosition
} from "../../../shared/contracts";
import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import { PetActionMenu } from "../../components/pet/PetActionMenu";
import { PetChatInput } from "../../components/pet/PetChatInput";
import { PetSpeechBubble } from "../../components/pet/PetSpeechBubble";
import { usePetBehavior } from "./usePetBehavior";
import { usePetStore } from "./petStore";
import {
  loadLlmSettings,
  loadPreferences,
  preferencesChannelName
} from "./userPreferences";

interface PetProps {
  manifest: CharacterManifest;
}

export function Pet({ manifest }: PetProps) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const state = usePetStore((store) => store.state);
  const message = usePetStore((store) => store.message);
  const setState = usePetStore((store) => store.setState);
  const { wake, showPersistentMessage, dismissMessage } = usePetBehavior(preferences.behavior);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customMusicUrl, setCustomMusicUrl] = useState("");
  const conversationId = useRef<string | undefined>(undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const chatStartedAt = useRef<number | null>(null);
  const danceStartedAt = useRef<number | null>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    windowPosition: WindowPosition;
    moved: boolean;
  } | null>(null);
  const dragRequest = useRef(0);
  const animation =
    manifest.animations[state] ??
    manifest.animations[manifest.defaultState] ??
    manifest.animations.idle;
  const music = customMusicUrl || manifest.sounds?.theme;

  useEffect(() => {
    let passthrough = false;
    const interactiveSelector = [
      ".pet-hitbox",
      ".pet-action-button",
      ".pet-chat-input",
      ".speech-bubble",
      ".settings-backdrop",
      ".settings-modal"
    ].join(",");

    const updateMousePassthrough = (event: MouseEvent): void => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const nextPassthrough = !target?.closest(interactiveSelector);
      if (nextPassthrough !== passthrough) {
        passthrough = nextPassthrough;
        window.petAPI.setMousePassthrough(passthrough);
      }
    };
    const enableMousePassthrough = (): void => {
      passthrough = true;
      window.petAPI.setMousePassthrough(true);
    };

    window.addEventListener("mousemove", updateMousePassthrough);
    window.addEventListener("mouseleave", enableMousePassthrough);
    window.petAPI.setMousePassthrough(true);

    return () => {
      window.removeEventListener("mousemove", updateMousePassthrough);
      window.removeEventListener("mouseleave", enableMousePassthrough);
      window.petAPI.setMousePassthrough(false);
    };
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(preferencesChannelName);
    channel.onmessage = () => setPreferences(loadPreferences());
    return () => channel.close();
  }, []);

  useEffect(() => {
    window.petAPI.setAlwaysOnTop(preferences.appearance.alwaysOnTop);
    window.petAPI.setWindowSize({
      width: Math.round(DEFAULT_CONFIG.window.width * preferences.appearance.scale),
      height: Math.round(DEFAULT_CONFIG.window.height * preferences.appearance.scale)
    });
  }, [preferences.appearance.alwaysOnTop, preferences.appearance.scale]);

  useEffect(() => {
    let active = true;
    if (!preferences.music.sourcePath) {
      setCustomMusicUrl("");
      return () => {
        active = false;
      };
    }
    window.petAPI
      .getMusicUrl(preferences.music.sourcePath)
      .then((url) => {
        if (active) {
          setCustomMusicUrl(url);
        }
      })
      .catch(() => {
        if (active) {
          setCustomMusicUrl("");
        }
      });
    return () => {
      active = false;
    };
  }, [preferences.music.sourcePath]);

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = preferences.music.volume / 100;
    }
  }, [preferences.music.volume]);

  if (!animation) {
    return <div className="error-bubble">角色包没有可用动画。</div>;
  }

  async function beginDrag(
    event: React.PointerEvent<HTMLButtonElement>
  ): Promise<void> {
    const requestId = ++dragRequest.current;
    const pointerX = event.screenX;
    const pointerY = event.screenY;
    event.currentTarget.setPointerCapture(event.pointerId);
    const windowPosition = await window.petAPI.getWindowPosition();
    if (requestId !== dragRequest.current) {
      return;
    }
    drag.current = {
      pointerX,
      pointerY,
      windowPosition,
      moved: false
    };
  }

  function continueDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!drag.current) {
      return;
    }
    const deltaX = event.screenX - drag.current.pointerX;
    const deltaY = event.screenY - drag.current.pointerY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      drag.current.moved = true;
    }
    if (drag.current.moved) {
      window.petAPI.moveWindow({
        x: drag.current.windowPosition.x + deltaX,
        y: drag.current.windowPosition.y + deltaY
      });
    }
  }

  function finishDrag(): void {
    dragRequest.current += 1;
    const wasMoved = drag.current?.moved ?? false;
    drag.current = null;
    if (!wasMoved) {
      wake();
      setMenuOpen((open) => !open);
    }
  }

  async function toggleMusic(): Promise<void> {
    if (!audio.current || !music) {
      wake("角色包里还没有音乐。", DEFAULT_CONFIG.behavior.replyDurationMs);
      return;
    }
    if (musicEnabled) {
      audio.current.pause();
      setMusicEnabled(false);
      recordDuration("dance", danceStartedAt);
      return;
    }
    try {
      await audio.current.play();
      setMusicEnabled(true);
      danceStartedAt.current = Date.now();
    } catch (error) {
      console.error("音乐播放失败：", error);
      setMusicEnabled(false);
      wake("音乐播放失败，请检查音频文件。", DEFAULT_CONFIG.behavior.replyDurationMs);
    }
  }

  async function sendMessage(input: string): Promise<void> {
    if (sending) {
      return;
    }
    setSending(true);
    setStreaming(true);
    setState("thinking", "让本喵想想哦...");
    try {
      let streamedAnswer = "";
      const settings = loadLlmSettings();
      const response = await window.petAPI.sendChatMessage({
        message: input,
        conversationId: conversationId.current,
        apiKey: settings.apiKey || undefined,
        baseUrl: settings.baseUrl || undefined,
        model: settings.model || undefined
      }, (text) => {
        streamedAnswer += text;
        setState("happy", streamedAnswer);
      });
      conversationId.current = response.conversationId;
      showPersistentMessage(response.answer);
    } catch (error) {
      const reason = error instanceof Error
        ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
        : "请求失败，请稍后重试。";
      showPersistentMessage(reason);
    } finally {
      setStreaming(false);
      setSending(false);
    }
  }

  function recordDuration(kind: "chat" | "dance", startedAt: React.MutableRefObject<number | null>): void {
    if (!startedAt.current) return;
    const seconds = Math.floor((Date.now() - startedAt.current) / 1_000);
    startedAt.current = null;
    if (seconds > 0) void window.petAPI.recordUsageActivity(kind, seconds).catch(() => undefined);
  }

  function toggleChat(): void {
    if (chatOpen) recordDuration("chat", chatStartedAt);
    else chatStartedAt.current = Date.now();
    setChatOpen((open) => !open);
  }

  async function toggleSettings(): Promise<void> {
    setSettingsOpen(await window.petAPI.toggleSettingsWindow());
  }

  return (
    <main
      className="pet-stage"
      aria-label={manifest.name}
      style={{
        opacity: preferences.appearance.opacity / 100,
        transform: `scale(${preferences.appearance.scale})`,
        transformOrigin: "right bottom"
      }}
    >
      {message && (
        <PetSpeechBubble
          key={state}
          message={message}
          thinking={state === "thinking"}
          streaming={streaming}
          dismissAfterMs={preferences.behavior.dismissAfterSeconds * 1_000}
          onDismiss={dismissMessage}
        />
      )}
      {menuOpen && (
        <PetActionMenu
          chatOpen={chatOpen}
          musicAvailable={Boolean(music)}
          musicEnabled={musicEnabled}
          settingsOpen={settingsOpen}
          onToggleChat={toggleChat}
          onToggleMusic={() => void toggleMusic()}
          onOpenSettings={() => void toggleSettings()}
        />
      )}
      <img
        className="pet-sprite"
        src={window.petAPI.assetUrl(animation)}
        alt={manifest.name}
        draggable={false}
      />
      <button
        className="pet-hitbox"
        type="button"
        aria-label={`和${manifest.name}互动`}
        onPointerDown={(event) => void beginDrag(event)}
        onPointerMove={continueDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => {
          dragRequest.current += 1;
          drag.current = null;
        }}
      />
      {chatOpen && <PetChatInput onSend={sendMessage} disabled={sending} />}
      {music && (
        <audio
          ref={audio}
          src={customMusicUrl || window.petAPI.assetUrl(music)}
          loop={preferences.music.loop}
          preload="metadata"
          onEnded={() => { setMusicEnabled(false); recordDuration("dance", danceStartedAt); }}
        />
      )}
    </main>
  );
}
