import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { CourseItem } from '@/lib/types/course';
import { Stem } from '@/components/game/Stem';
import { OptionGrid } from '@/components/game/OptionGrid';

interface PreviewPanelV2Props {
  item: CourseItem | null;
  onRefresh?: () => void;
  onOptionSelect?: (index: number) => void;
  contentVersion?: string;
  courseId?: string;
  courseTitle?: string;
}

export const PreviewPanelV2: React.FC<PreviewPanelV2Props> = ({
  item,
  onRefresh,
  onOptionSelect,
  contentVersion,
  courseId,
  courseTitle,
}) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  if (!item) {
    return (
      <aside className="w-[400px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
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
  };

  return (
    <aside className="w-[400px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
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

      {/* Content - Use actual game components for WYSIWYG */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-full">
          {/* Question Stem - using actual Stem component */}
          <div className="mb-6">
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

          {/* Options - using actual OptionGrid component */}
          {item.mode === 'options' && options.length > 0 && (
            <div className="mt-6">
              <OptionGrid
                options={options}
                onSelect={handleOptionSelect}
                disabled={false}
                selectedIndex={selectedOption ?? undefined}
                itemId={itemId}
                optionMedia={optionMedia}
                courseTitle={courseTitle}
                cacheKey={contentVersion}
                courseId={courseId}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

