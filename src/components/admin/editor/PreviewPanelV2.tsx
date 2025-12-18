import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CourseItem } from '@/lib/types/course';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';
import { resolvePublicMediaUrl } from '@/lib/media/resolvePublicMediaUrl';

interface PreviewPanelV2Props {
  item: CourseItem | null;
  onRefresh?: () => void;
  onOptionSelect?: (index: number) => void;
  contentVersion?: string;
}

export const PreviewPanelV2: React.FC<PreviewPanelV2Props> = ({
  item,
  onRefresh,
  onOptionSelect,
  contentVersion,
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
  
  // Get media from item.stem.media or item.stimulus.media
  const stemMedia = (item as any)?.stem?.media || (item as any)?.stimulus?.media || [];
  
  // Sanitize HTML for safe rendering
  const sanitizedStemHtml = sanitizeHtml(stemText);

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
        <div className="bg-gray-100 rounded-2xl p-4 max-w-[340px] mx-auto shadow-lg border border-gray-200">
          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            {/* Question */}
            <div className="p-4">
              {/* Render media first (images) */}
              {stemMedia
                .filter((m: any) => m.type === 'image' && m.url)
                .map((mediaItem: any, idx: number) => {
                  const imageUrl = resolvePublicMediaUrl(mediaItem.url, contentVersion);
                  return (
                    <div key={mediaItem.id || idx} className="mb-4 rounded-lg overflow-hidden">
                      <img
                        src={imageUrl}
                        alt={mediaItem.alt || 'Question image'}
                        className="w-full h-auto object-contain max-h-[200px] mx-auto"
                        onError={(e) => {
                          // Hide broken images
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  );
                })}
              
              {/* Render HTML question text (WYSIWYG) */}
              <div 
                className="text-[15px] leading-relaxed min-h-[100px] prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedStemHtml }}
              />
            </div>

            {/* Options */}
            <div className="px-4 pb-4">
              {options.map((option: string, index: number) => {
                const isSelected = selectedOption === index;
                const letter = String.fromCharCode(65 + index);
                // Sanitize option HTML too
                const sanitizedOptionHtml = sanitizeHtml(option);

                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-start gap-3 p-3 border-2 rounded-md mb-2 cursor-pointer transition-all',
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
                        'w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-semibold flex-shrink-0 mt-0.5',
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      )}
                    >
                      {letter}
                    </span>
                    <div 
                      className="flex-1 text-[14px] leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizedOptionHtml || `Option ${letter}` }}
                    />
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

