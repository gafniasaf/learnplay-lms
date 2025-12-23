import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { CourseItem } from '@/lib/types/course';
import { Stem } from '@/components/game/Stem';
import { OptionGrid } from '@/components/game/OptionGrid';
import { NumericPad } from '@/components/game/NumericPad';

interface PreviewPanelV2Props {
  item: CourseItem | null;
  onRefresh?: () => void;
  onOptionSelect?: (index: number) => void;
  contentVersion?: string;
  courseId?: string;
  courseTitle?: string;
  fullScreen?: boolean;
}

export const PreviewPanelV2: React.FC<PreviewPanelV2Props> = ({
  item,
  onRefresh,
  onOptionSelect,
  contentVersion,
  courseId,
  courseTitle,
  fullScreen = false,
}) => {
  // Keep preview interactions close to Play.tsx:
  // - options mode: OptionGrid
  // - numeric mode: NumericPad
  // We also track a lightweight "phase" + correctness so the UI feedback matches what students see.
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'feedback-correct' | 'feedback-wrong'>('idle');
  const [isCorrect, setIsCorrect] = useState<boolean | undefined>(undefined);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset on item change
    setSelectedOption(null);
    setPhase('idle');
    setIsCorrect(undefined);
    if (resetTimerRef.current != null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, [(item as any)?.id]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  if (!item) {
    return (
      <aside className={fullScreen ? "w-full bg-white flex flex-col flex-shrink-0" : "w-[800px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0"}>
        <div className="px-4 py-4 border-b border-gray-200">
          <span className="font-semibold text-sm">📱 Live Preview</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400">
          No item selected
        </div>
      </aside>
    );
  }

  // Extract data in the format expected by game components
  const stemText = (item as any)?.stem?.text || (item as any)?.text || 'No question text';
  const stemMedia = (item as any)?.stem?.media || null;
  const stimulus = (item as any)?.stimulus || undefined;
  
  // Options: handle both string[] and object[] formats
  const options = (item as any)?.options?.map((o: any) =>
    typeof o === 'string' ? o : o?.text || ''
  ) || [];
  
  // Option media: array where optionMedia[index] corresponds to options[index]
  const optionMedia = (item as any)?.optionMedia || [];
  
  // Item ID for Stem component
  const itemId = typeof (item as any)?.id === 'number' ? (item as any).id : undefined;

  const handleOptionSelect = (index: number) => {
    setSelectedOption(index);
    onOptionSelect?.(index);

    const correctIndex = (item as any)?.correctIndex;
    if (typeof correctIndex === 'number') {
      const ok = index === correctIndex;
      setIsCorrect(ok);
      setPhase(ok ? 'feedback-correct' : 'feedback-wrong');
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        setPhase('idle');
        setIsCorrect(undefined);
        setSelectedOption(null);
        resetTimerRef.current = null;
      }, 900);
    }
  };

  const handleNumericSubmit = (value: number) => {
    const expected = (item as any)?.answer;
    const ok = typeof expected === 'number' ? value === expected : String(value) === String(expected ?? '');
    setIsCorrect(ok);
    setPhase(ok ? 'feedback-correct' : 'feedback-wrong');
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setPhase('idle');
      setIsCorrect(undefined);
      resetTimerRef.current = null;
    }, 900);
  };

  return (
    <aside className={fullScreen ? "w-full bg-white flex flex-col flex-shrink-0" : "w-[800px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0"}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
        <span className="font-semibold text-sm">📱 Live Preview</span>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            data-cta-id="cta-courseeditor-preview-refresh"
            data-action="action"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Content - Match Play.tsx structure exactly */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-primary/5 via-background to-accent/5">
        {/* Match the exact container structure from Play.tsx: w-full max-w-5xl mx-auto */}
        {/* Scale down proportionally: max-w-5xl is 1024px, so scale to fit 800px panel */}
        <div className="w-full mx-auto h-full flex flex-col overflow-hidden p-4" style={{ maxWidth: '100%' }}>
          {/* Match the exact content wrapper from Play.tsx: flex flex-col items-center justify-start min-h-full gap-6 py-2 */}
          <div className="flex flex-col items-center justify-start min-h-full gap-6 py-2 w-full">
            {/* Question Stem - using actual Stem component */}
            <div className="w-full">
              <Stem
                text={stemText}
                stimulus={stimulus}
                stemMedia={stemMedia}
                courseTitle={courseTitle}
                itemId={itemId}
                cacheKey={contentVersion}
                courseId={courseId}
              />
            </div>

            {/* Answer interaction (match Play.tsx routing for common modes) */}
            {((item as any).mode === 'numeric') ? (
              <NumericPad
                onSubmit={handleNumericSubmit}
                disabled={phase !== 'idle'}
                phase={phase}
              />
            ) : (
              // Default: options mode
              options.length > 0 && (
                <div className="w-full">
                  <OptionGrid
                    options={options}
                    onSelect={handleOptionSelect}
                    disabled={phase !== 'idle'}
                    selectedIndex={selectedOption ?? undefined}
                    isCorrect={isCorrect}
                    phase={phase}
                    itemId={itemId}
                    clusterId={(item as any)?.clusterId}
                    variant={(item as any)?.variant}
                    optionMedia={optionMedia}
                    courseTitle={courseTitle}
                    cacheKey={contentVersion}
                    courseId={courseId}
                  />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

