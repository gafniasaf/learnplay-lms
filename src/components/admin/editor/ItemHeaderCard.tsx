import React from 'react';
import { ImageOff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ItemHeaderCardProps {
  item: any;
  groupIndex: number;
  itemIndex: number;
  course: any;
  mode: 'options' | 'numeric';
  onModeChange: (mode: 'options' | 'numeric') => void;
  /** @deprecated No longer used - image actions moved to StemTab */
  onAddImageAI?: () => void;
  /** @deprecated No longer used - batch action moved to Command Palette */
  onFixMissingImages?: () => void;
  hasMissingImage?: boolean;
}

export const ItemHeaderCard: React.FC<ItemHeaderCardProps> = ({
  item,
  groupIndex,
  itemIndex,
  course,
  mode,
  onModeChange,
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
          {hasMissingImage && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-100 text-amber-600 rounded-full cursor-help">
                    <ImageOff className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">No stem image — add one in the Stem tab</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
    </div>
  );
};

