import { useEffect, useRef } from "react";

interface FeedbackAnnouncerProps {
  message: string;
}

/**
 * Invisible component that announces feedback to screen readers
 * Uses aria-live="polite" for non-intrusive announcements
 */
export const FeedbackAnnouncer = ({ message }: FeedbackAnnouncerProps) => {
  const previousMessage = useRef<string>("");

  useEffect(() => {
    // Only update if message actually changed
    if (message && message !== previousMessage.current) {
      previousMessage.current = message;
    }
  }, [message]);

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
      aria-relevant="additions text"
    >
      {message}
    </div>
  );
};
