import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface PetSpeechBubbleProps {
  message: string;
  thinking?: boolean;
  streaming?: boolean;
  onDismiss?: () => void;
}

function normalizeModelMarkdown(message: string): string {
  // 部分模型会输出 ** 粗体 **；CommonMark 要求标记内侧不能有空格。
  return message.replace(/\*\*[ \t]+(.+?)[ \t]+\*\*/g, "**$1**");
}

export function PetSpeechBubble({
  message,
  thinking = false,
  streaming = false,
  onDismiss
}: PetSpeechBubbleProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dismissTimer = useRef<number | undefined>(undefined);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  function cancelDismiss(): void {
    window.clearTimeout(dismissTimer.current);
  }

  function scheduleDismiss(): void {
    cancelDismiss();
    if (!thinking && !streaming && onDismiss) {
      dismissTimer.current = window.setTimeout(onDismiss, 30_000);
    }
  }

  function updateScrollHint(): void {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    setHasMoreBelow(
      content.scrollTop + content.clientHeight < content.scrollHeight - 2
    );
  }

  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    content.scrollTop = streaming ? content.scrollHeight : 0;
    updateScrollHint();
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(content);
    return () => observer.disconnect();
  }, [message, streaming]);

  useEffect(() => {
    scheduleDismiss();
    return cancelDismiss;
  }, [message, thinking, streaming, onDismiss]);

  return (
    <aside
      className={`speech-bubble${thinking ? " is-thinking" : ""}`}
      role="status"
      aria-live="polite"
      onMouseEnter={cancelDismiss}
      onMouseLeave={scheduleDismiss}
    >
      <div
        ref={contentRef}
        className="speech-bubble-content"
        onScroll={updateScrollHint}
      >
        {thinking ? (
          <div className="thinking-indicator">
            <span className="thinking-spinner" aria-hidden="true" />
            <span>{message}</span>
          </div>
        ) : (
          <Markdown remarkPlugins={[remarkBreaks]} skipHtml>
            {normalizeModelMarkdown(message)}
          </Markdown>
        )}
      </div>
      {hasMoreBelow && (
        <div className="speech-scroll-hint" aria-hidden="true">
          <span>⌄</span>
        </div>
      )}
    </aside>
  );
}
