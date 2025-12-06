import React from 'react';
import { Button } from '@/components/ui/button';

export type ImageGenerateButtonProps = {
  courseId: string;
  itemId: string;
  defaultPrompt: string;
  onStarted?: () => void;
  onDone?: (result: { ok: boolean; jobId?: string; status?: string; error?: string }) => void;
  disabled?: boolean;
};

export function ImageGenerateButton(props: ImageGenerateButtonProps) {
  const { onStarted, onDone, disabled } = props;

  const handleClick = async () => {
    if (onStarted) onStarted();
    try {
      const res = await fetch('/functions/v1/enqueue-course-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: props.courseId,
          itemId: Number(props.itemId),
          prompt: props.defaultPrompt,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        onDone?.({ ok: false, status: 'error', error: txt });
        return;
      }
      const j = await res.json();
      onDone?.({ ok: true, jobId: j?.mediaJobId, status: 'pending' });
    } catch (e: any) {
      onDone?.({ ok: false, status: 'error', error: e?.message || String(e) });
    }
  };

  return (
    <Button variant="default" onClick={handleClick} disabled={disabled} aria-label="Generate image">
      Generate image
    </Button>
  );
}


