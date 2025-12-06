import React from 'react';
import { Button } from '@/components/ui/button';
import { useMCP } from '@/hooks/useMCP';

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
  const mcp = useMCP();

  const handleClick = async () => {
    if (onStarted) onStarted();
    try {
      const result = await mcp.call<{ ok: boolean; mediaJobId?: string }>('enqueue-course-media', {
        courseId: props.courseId,
        itemId: Number(props.itemId),
        prompt: props.defaultPrompt,
      });
      onDone?.({ ok: result.ok, jobId: result.mediaJobId, status: 'pending' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      onDone?.({ ok: false, status: 'error', error: message });
    }
  };

  return (
    <Button variant="default" onClick={handleClick} disabled={disabled} aria-label="Generate image">
      Generate image
    </Button>
  );
}


