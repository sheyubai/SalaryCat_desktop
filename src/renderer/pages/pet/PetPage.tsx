import { useEffect, useState } from "react";

import type { CharacterManifest } from "../../../shared/contracts";
import { DEFAULT_CONFIG } from "../../../shared/defaultConfig";
import { Pet } from "../../scripts/pet/Pet";
import { SettingsPage } from "./SettingsPage";

export function PetPage() {
  if (window.location.hash === "#settings") {
    return <SettingsPage />;
  }
  const [manifest, setManifest] = useState<CharacterManifest | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    try {
      if (!window.petAPI) {
        throw new Error("Electron Preload API 未加载。");
      }
      window.petAPI
        .getCharacterManifest(DEFAULT_CONFIG.characterId)
        .then((value) => {
          if (active) {
            setManifest(value);
          }
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <div className="error-bubble">角色加载失败：{error}</div>;
  }

  if (!manifest) {
    return <div className="loading-bubble">月薪喵正在醒来…</div>;
  }

  return <Pet manifest={manifest} />;
}
