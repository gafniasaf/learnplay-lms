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
    <aside className="w-[280px] bg-[#1c1917] flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#3f3f46]">
        <span className="text-[12px] font-black uppercase tracking-wider text-[#a8a29e] font-['Archivo_Black']">
          Course Structure
        </span>
        {onCollapseAll && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-[#292524]"
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
                    'flex items-center justify-between px-3 py-2 text-[#e7e5e4] font-semibold text-[13px] cursor-pointer rounded-md transition-colors hover:bg-[#292524]',
                    isExpanded && 'expanded'
                  )}
                  onClick={() => toggleGroup(groupIdx)}
                  data-cta-id={`cta-courseeditor-nav-group-toggle-${groupIdx}`}
                  data-action="action"
                >
                  <span>{group.name || `Group ${groupIdx + 1}`}</span>
                  <span
                    className={cn(
                      'text-[#a8a29e] transition-transform',
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
                              : 'text-[#a8a29e] hover:bg-[#292524] hover:text-[#e7e5e4]'
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
        <div className="p-3 border-t border-[#3f3f46]">
          <button
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-[#292524] text-[#a8a29e] border border-dashed border-[#3f3f46] rounded-md text-[13px] cursor-pointer transition-all hover:bg-[#1c1917] hover:text-[#e7e5e4] hover:border-[#a8a29e]"
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

