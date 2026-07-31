interface PetSpeechBubbleProps {
  message: string;
}

export function PetSpeechBubble({ message }: PetSpeechBubbleProps) {
  return (
    <aside className="speech-bubble" role="status" aria-live="polite">
      {message}
    </aside>
  );
}
