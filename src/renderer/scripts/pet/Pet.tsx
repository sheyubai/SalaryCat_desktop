import { useEffect, useRef, useState } from "react";

import type {
  CharacterManifest,
  WindowPosition
} from "../../../shared/contracts";
import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import { PetActionMenu } from "../../components/pet/PetActionMenu";
import { PetChatInput } from "../../components/pet/PetChatInput";
import { PetSpeechBubble } from "../../components/pet/PetSpeechBubble";
import { PetSprite } from "../../components/pet/PetSprite";
import { usePetBehavior } from "./usePetBehavior";
import { usePetChat } from "./usePetChat";
import { usePetDance } from "./usePetDance";
import { usePetStore } from "./petStore";
import {
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
  const themeUrl = manifest.sounds?.theme ? window.petAPI.assetUrl(manifest.sounds.theme) : "";
  const dance = usePetDance(preferences.music, themeUrl);
  const behavior = usePetBehavior(preferences.behavior, dance.playing || dance.status === "starting");
  const { wake, dismissMessage } = behavior;
  const { sending, sendMessage } = usePetChat(behavior);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatStartedAt = useRef<number | null>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    windowPosition: WindowPosition;
    moved: boolean;
  } | null>(null);
  const dragRequest = useRef(0);
  const restingAnimation =
    manifest.animations[state] ??
    manifest.animations[manifest.defaultState] ??
    manifest.animations.idle;
  const danceAnimation = manifest.animations.dancing ?? restingAnimation;
  const animation = dance.playing ? danceAnimation : restingAnimation;

  useEffect(() => {
    let passthrough = true;
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
      toggleMenu();
    }
  }

  function toggleMenu(): void {
    wake();
    setMenuOpen((open) => !open);
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
          streaming={sending}
          dismissAfterMs={preferences.behavior.dismissAfterSeconds * 1_000}
          onDismiss={dismissMessage}
        />
      )}
      {menuOpen && (
        <PetActionMenu
          chatOpen={chatOpen}
          danceStatus={dance.status}
          musicError={dance.error}
          settingsOpen={settingsOpen}
          onToggleChat={toggleChat}
          onToggleMusic={dance.toggle}
          onOpenSettings={() => void toggleSettings()}
        />
      )}
      <PetSprite
        src={window.petAPI.assetUrl(animation)}
        name={manifest.name}
      />
      {dance.playing && <div className="pet-dance-notes" aria-hidden="true"><span>♪</span><span>♫</span></div>}
      <button
        className="pet-hitbox"
        type="button"
        aria-label={`和${manifest.name}互动`}
        onClick={(event) => { if (event.detail === 0) toggleMenu(); }}
        onPointerDown={(event) => void beginDrag(event)}
        onPointerMove={continueDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => {
          dragRequest.current += 1;
          drag.current = null;
        }}
      />
      {chatOpen && <PetChatInput onSend={sendMessage} disabled={sending} />}
    </main>
  );
}
