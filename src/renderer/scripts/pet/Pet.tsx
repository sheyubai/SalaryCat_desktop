import { useRef, useState } from "react";

import type {
  CharacterManifest,
  WindowPosition
} from "../../../shared/contracts";
import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import { PetActionMenu } from "../../components/pet/PetActionMenu";
import { PetChatInput } from "../../components/pet/PetChatInput";
import { PetSpeechBubble } from "../../components/pet/PetSpeechBubble";
import { createPetReply } from "./createPetReply";
import { usePetBehavior } from "./usePetBehavior";
import { usePetStore } from "./petStore";

interface PetProps {
  manifest: CharacterManifest;
}

export function Pet({ manifest }: PetProps) {
  const state = usePetStore((store) => store.state);
  const message = usePetStore((store) => store.message);
  const { wake } = usePetBehavior();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
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
  const music = manifest.sounds?.theme;

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
      return;
    }
    try {
      await audio.current.play();
      setMusicEnabled(true);
    } catch (error) {
      console.error("音乐播放失败：", error);
      setMusicEnabled(false);
      wake("音乐播放失败，请检查音频文件。", DEFAULT_CONFIG.behavior.replyDurationMs);
    }
  }

  function sendMessage(input: string): void {
    wake(createPetReply(input), DEFAULT_CONFIG.behavior.replyDurationMs);
  }

  return (
    <main className="pet-stage" aria-label={manifest.name}>
      {message && <PetSpeechBubble message={message} />}
      {menuOpen && (
        <PetActionMenu
          chatOpen={chatOpen}
          musicAvailable={Boolean(music)}
          musicEnabled={musicEnabled}
          onToggleChat={() => setChatOpen((open) => !open)}
          onToggleMusic={() => void toggleMusic()}
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
      {chatOpen && <PetChatInput onSend={sendMessage} />}
      {music && (
        <audio
          ref={audio}
          src={window.petAPI.assetUrl(music)}
          loop
          preload="metadata"
        />
      )}
    </main>
  );
}
