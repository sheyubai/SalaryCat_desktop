import { useEffect, useRef, useState, type FormEvent } from "react";

interface PetChatInputProps {
  onSend: (message: string) => Promise<boolean>;
  onStop: () => void;
  onNewConversation: () => void;
  disabled?: boolean;
}

export function PetChatInput({ onSend, onStop, onNewConversation, disabled = false }: PetChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const pending = useRef<symbol | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [disabled]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const message = value.trim();
    if (!message || disabled || pending.current || composing.current) {
      return;
    }
    const request = Symbol();
    pending.current = request;
    try {
      const success = await onSend(message);
      if (pending.current === request && success) setValue("");
    } finally {
      if (pending.current === request) pending.current = null;
    }
  }

  return (
    <form className="pet-chat-input" onSubmit={submit}>
      <button type="button" className="chat-new" aria-label="开始新对话" title="开始新对话" disabled={disabled}
        onClick={() => { onNewConversation(); inputRef.current?.focus(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <input
        ref={inputRef}
        value={value}
        maxLength={4000}
        aria-label="对月薪喵说话"
        placeholder="和月薪喵说点什么..."
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
        }}
      />
      {disabled ? <button type="button" aria-label="停止生成" title="停止生成" onClick={() => { pending.current = null; onStop(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
      </button> : <button type="submit" aria-label="发送" title="发送" disabled={!value.trim()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />
        </svg>
      </button>}
    </form>
  );
}
