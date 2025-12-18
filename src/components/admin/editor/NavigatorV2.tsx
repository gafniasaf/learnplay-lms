import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChevronRight, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavigatorV2Props {
  course: any;
  activeGroupIndex: number;
  activeItemIndex: number;
  onItemSelect: (groupIndex: number, itemIndex: number) => void;
  unsavedItems: Set<string>;
  onAddGroup?: () => void;
  onCollapseAll?: () => void;
}

export const NavigatorV2: React.FC<NavigatorV2Props> = ({
  course,
  activeGroupIndex,
  activeItemIndex,
  onItemSelect,
  unsavedItems,
  onAddGroup,
  onCollapseAll,
}) => {
  const groups = course?.groups || [];
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(
    new Set([0]) // Default: first group expanded
  );

  const toggleGroup = (groupIdx: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupIdx)) {
        next.delete(groupIdx);
      } else {
        next.add(groupIdx);
      }
      return next;
    });
  };

  const handleCollapseAll = () => {
    setExpandedGroups(new Set());
    onCollapseAll?.();
  };

  return (
    <aside className="w-[280px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 bg-gray-50/50">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-gray-700">
          Course Structure
        </span>
        {onCollapseAll && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            onClick={handleCollapseAll}
            data-cta-id="cta-courseeditor-nav-collapse-all"
            data-action="action"
          >
            <Folder className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {groups.map((group: any, groupIdx: number) => {
            const isExpanded = expandedGroups.has(groupIdx);
            const items = group.items || [];

            return (
              <div key={groupIdx} className="mb-2">
                {/* Group Header */}
                <div
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-gray-700 font-semibold text-[13px] cursor-pointer rounded-md transition-colors hover:bg-gray-50',
                    isExpanded && 'expanded'
                  )}
                  onClick={() => toggleGroup(groupIdx)}
                  data-cta-id={`cta-courseeditor-nav-group-toggle-${groupIdx}`}
                  data-action="action"
                >
                  <span>{group.name || `Group ${groupIdx + 1}`}</span>
                  <span
                    className={cn(
                      'text-gray-400 transition-transform',
                      isExpanded && 'rotate-90'
                    )}
                  >
                    ▶
                  </span>
                </div>

                {/* Group Items */}
                {isExpanded && (
                  <div className="pl-3">
                    {items.map((item: any, itemIdx: number) => {
                      const isActive =
                        groupIdx === activeGroupIndex &&
                        itemIdx === activeItemIndex;
                      const itemKey = `${groupIdx}-${itemIdx}`;
                      const hasUnsaved = unsavedItems.has(itemKey);

                      return (
                        <div
                          key={itemIdx}
                          className={cn(
                            'flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer rounded-md transition-all my-1',
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          )}
                          onClick={() => onItemSelect(groupIdx, itemIdx)}
                          data-cta-id={`cta-courseeditor-nav-item-select-${groupIdx}-${itemIdx}`}
                          data-action="action"
                        >
                          <span>Item {item.id ?? itemIdx}</span>
                          {hasUnsaved && (
                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      {onAddGroup && (
        <div className="p-3 border-t border-gray-200">
          <button
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-gray-50 text-gray-600 border border-dashed border-gray-300 rounded-md text-[13px] cursor-pointer transition-all hover:bg-gray-100 hover:text-gray-900 hover:border-gray-400"
            onClick={onAddGroup}
            data-cta-id="cta-courseeditor-nav-add-group"
            data-action="action"
          >
            + Add Group
          </button>
        </div>
      )}
    </aside>
  );
};

