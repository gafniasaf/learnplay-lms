import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CourseItem } from '@/lib/types/course';

interface PreviewPanelV2Props {
  item: CourseItem | null;
  onRefresh?: () => void;
  onOptionSelect?: (index: number) => void;
}

export const PreviewPanelV2: React.FC<PreviewPanelV2Props> = ({
  item,
  onRefresh,
  onOptionSelect,
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

  const stemText =
    (item as any)?.stem?.text || (item as any)?.text || 'No question text';
  const options =
    (item as any)?.options?.map((o: any) =>
      typeof o === 'string' ? o : o?.text || ''
    ) || [];

  const handleOptionClick = (index: number) => {
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Device Frame */}
        <div className="bg-[#1c1917] rounded-2xl p-4 max-w-[340px] mx-auto shadow-xl">
          <div className="bg-white rounded-lg overflow-hidden">
            {/* Question */}
            <div className="p-4 text-[15px] leading-relaxed min-h-[100px]">
              {stemText}
            </div>

            {/* Options */}
            <div className="px-4 pb-4">
              {options.map((option: string, index: number) => {
                const isSelected = selectedOption === index;
                const letter = String.fromCharCode(65 + index);

                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center gap-3 p-3 border-2 rounded-md mb-2 cursor-pointer transition-all',
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                    )}
                    onClick={() => handleOptionClick(index)}
                    data-cta-id={`cta-courseeditor-preview-option-select-${index}`}
                    data-action="action"
                  >
                    <span
                      className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-semibold',
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200'
                      )}
                    >
                      {letter}
                    </span>
                    <span className="flex-1">{option || `Option ${letter}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

