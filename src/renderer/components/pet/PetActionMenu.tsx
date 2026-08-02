interface PetActionMenuProps {
  chatOpen: boolean;
  musicAvailable: boolean;
  musicEnabled: boolean;
  onToggleChat: () => void;
  onToggleMusic: () => void;
  onOpenSettings: () => void;
}

function MusicIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
      {!enabled && <path className="icon-slash" d="M4 4l16 16" />}
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 2h5l.6 2.5 2.1 1.2 2.5-.7 2.5 4.3-1.9 1.8v2.4l1.9 1.8-2.5 4.3-2.5-.7-2.1 1.2-.6 2.5h-5l-.6-2.5-2.1-1.2-2.5.7-2.5-4.3 1.9-1.8v-2.4L1.8 9.3 4.3 5l2.5.7 2.1-1.2L9.5 2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PetActionMenu({
  chatOpen,
  musicAvailable,
  musicEnabled,
  onToggleChat,
  onToggleMusic,
  onOpenSettings
}: PetActionMenuProps) {
  const musicLabel = musicEnabled ? "关闭音乐" : "开启音乐";
  const chatLabel = chatOpen ? "收起对话" : "开始对话";

  return (
    <nav className="pet-action-menu" aria-label="桌宠操作">
      <button
        className={`pet-action-button${musicEnabled ? " is-active" : ""}`}
        type="button"
        aria-label={musicLabel}
        data-tooltip={musicLabel}
        disabled={!musicAvailable}
        onClick={onToggleMusic}
      >
        <MusicIcon enabled={musicEnabled} />
      </button>
      <button
        className={`pet-action-button${chatOpen ? " is-active" : ""}`}
        type="button"
        aria-label={chatLabel}
        data-tooltip={chatLabel}
        onClick={onToggleChat}
      >
        <ChatIcon />
      </button>
      <button
        className="pet-action-button"
        type="button"
        aria-label="设置"
        data-tooltip="设置"
        onClick={onOpenSettings}
      >
        <SettingsIcon />
      </button>
    </nav>
  );
}
