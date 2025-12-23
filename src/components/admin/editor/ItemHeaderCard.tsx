import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ItemHeaderCardProps {
  item: any;
  groupIndex: number;
  itemIndex: number;
  course: any;
  mode: 'options' | 'numeric';
  onModeChange: (mode: 'options' | 'numeric') => void;
  onAddImageAI: () => void;
  onFixMissingImages: () => void;
  hasMissingImage?: boolean;
}

export const ItemHeaderCard: React.FC<ItemHeaderCardProps> = ({
  item,
  groupIndex,
  itemIndex,
  course,
  mode,
  onModeChange,
  onAddImageAI,
  onFixMissingImages,
  hasMissingImage = false,
}) => {
  const group = course?.groups?.[groupIndex];
  const clusterId = group?.clusterId || `cluster-${groupIndex}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-4 shadow-sm flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-black font-['Archivo_Black'] flex items-center gap-2">
          <span className="font-mono text-xs px-2 py-1 bg-blue-600 text-white rounded">
            Item {itemIndex}
          </span>
          {group?.name || course?.title || 'Untitled Course'}
        </h1>
        <div className="flex items-center gap-4 text-[13px] text-gray-500">
          <div className="flex items-center gap-1">
            <label>Mode:</label>
            <select
              value={mode}
              onChange={(e) =>
                onModeChange(e.target.value as 'options' | 'numeric')
              }
              className="px-2 py-1 text-[13px] border border-gray-200 rounded bg-white cursor-pointer"
              data-cta-id="cta-courseeditor-mode-select"
              data-action="action"
            >
              <option value="options">MCQ</option>
              <option value="numeric">Numeric</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span>Cluster:</span>
            <strong className="font-mono">{clusterId}</strong>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasMissingImage && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
            🖼️ Missing stem image
          </span>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={onAddImageAI}
          data-cta-id="cta-courseeditor-item-add-image-ai"
          data-action="action"
          title="Generate an AI image for the question stem"
        >
          <Image className="h-3.5 w-3.5 mr-1.5" />
          Add Stem Image (AI)
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onFixMissingImages}
          data-cta-id="cta-courseeditor-item-fix-missing-images"
          data-action="action"
          title="Course-wide: enqueue AI jobs for items missing stem images"
        >
          🧩 Fix Missing Stem Images (AI)
        </Button>
      </div>
    </div>
  );
};

