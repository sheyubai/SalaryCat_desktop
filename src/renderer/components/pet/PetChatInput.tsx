import { useEffect, useRef, useState, type FormEvent } from "react";

interface PetChatInputProps {
  onSend: (message: string) => void;
}

export function PetChatInput({ onSend }: PetChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const message = value.trim();
    if (!message) {
      return;
    }
    onSend(message);
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <form className="pet-chat-input" onSubmit={submit}>
      <input
        ref={inputRef}
        value={value}
        maxLength={120}
        aria-label="对月薪喵说话"
        placeholder="和月薪喵说点什么…"
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" aria-label="发送" title="发送" disabled={!value.trim()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />
        </svg>
      </button>
    </form>
  );
}
