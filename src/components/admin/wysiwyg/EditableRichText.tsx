import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/utils/sanitizeHtml";

interface EditableRichTextProps {
  html: string;
  onChangeHtml: (nextHtml: string) => void;
  className?: string;
  dataCtaId: string;
  dataAction?: string;
  ariaLabel?: string;
  sanitizeOnBlur?: boolean;
}

export function EditableRichText({
  html,
  onChangeHtml,
  className,
  dataCtaId,
  dataAction = "edit",
  ariaLabel,
  sanitizeOnBlur = true,
}: EditableRichTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Sync external changes (e.g., switching exercises) without destroying cursor while typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focused) return;
    const next = html || "";
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [html, focused]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    onChangeHtml(el.innerHTML);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn(className)}
      onInput={emit}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const el = ref.current;
        if (!el) return;
        if (sanitizeOnBlur) {
          const cleaned = sanitizeHtml(el.innerHTML || "");
          if (cleaned !== el.innerHTML) el.innerHTML = cleaned;
          onChangeHtml(cleaned);
        } else {
          emit();
        }
      }}
      data-cta-id={dataCtaId}
      data-action={dataAction}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
    />
  );
}


