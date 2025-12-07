import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, ArrowUp, ArrowDown, Copy, Trash2, GripVertical, MoreVertical, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsedState {
  [groupIdx: number]: boolean;
}

interface NavigatorProps {
  course: any;
  activeGroupIndex: number;
  activeItemIndex: number;
  onItemSelect: (groupIndex: number, itemIndex: number) => void;
  unsavedItems: Set<string>;
  onAddGroup?: () => void;
  onAddItem?: (groupIndex: number) => void;
  onDuplicateItem?: (groupIndex: number, itemIndex: number) => void;
  onDeleteItem?: (groupIndex: number, itemIndex: number) => void;
  onMoveGroup?: (groupIndex: number, dir: -1 | 1) => void;
  onMoveItem?: (groupIndex: number, itemIndex: number, dir: -1 | 1) => void;
  onReorderGroups?: (fromIndex: number, toIndex: number) => void;
  onReorderItems?: (groupIndex: number, fromIndex: number, toIndex: number) => void;
}

export const Navigator = ({
  course,
  activeGroupIndex,
  activeItemIndex,
  onItemSelect,
  unsavedItems,
  onAddGroup,
  onAddItem,
  onDuplicateItem,
  onDeleteItem,
  onMoveGroup,
  onMoveItem,
  onReorderGroups,
  onReorderItems,
}: NavigatorProps) => {
  const groups = course?.groups || [];
  
  // Collapsed state for groups
  const [collapsed, setCollapsed] = React.useState<CollapsedState>({});

  // DnD state
  const [_dragGroupFrom, setDragGroupFrom] = React.useState<number | null>(null);
  const [_dragItemFrom, setDragItemFrom] = React.useState<{ g: number; i: number } | null>(null);
  const [dragOverGroup, setDragOverGroup] = React.useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = React.useState<string | null>(null);

  const toggleGroup = (groupIdx: number) => {
    setCollapsed(prev => ({
      ...prev,
      [groupIdx]: !prev[groupIdx]
    }));
  };

  const parseDT = (dt: DataTransfer) => {
    const t = dt.getData('text/plain');
    if (t.startsWith('group:')) return { kind: 'group', g: Number(t.split(':')[1]) } as const;
    if (t.startsWith('item:')) {
      const [, g, i] = t.split(':');
      return { kind: 'item', g: Number(g), i: Number(i) } as const;
    }
    return null;
  };

  return (
    <div className="h-full bg-background border-r border-border flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
          Course Structure
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {groups.map((group: any, groupIdx: number) => {
            const isCollapsed = collapsed[groupIdx];
            
            return (
              <div key={groupIdx}>
                {/* Group Header */}
                <div
                  className={cn(
                    "group/header flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors",
                    dragOverGroup === groupIdx && 'bg-accent',
                    "hover:bg-accent/50"
                  )}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', `group:${groupIdx}`); setDragGroupFrom(groupIdx); }}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDragEnter={() => setDragOverGroup(groupIdx)}
                  onDragLeave={() => setDragOverGroup(null)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOverGroup(null);
                    const info = parseDT(e.dataTransfer);
                    if (!info) return;
                    if (info.kind === 'group' && typeof onReorderGroups === 'function') {
                      if (info.g !== groupIdx) onReorderGroups(info.g, groupIdx);
                    }
                  }}
                  onClick={() => toggleGroup(groupIdx)}
                >
                  {/* Expand/Collapse Icon */}
                  <button className="p-0.5 hover:bg-accent rounded">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Drag Handle */}
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover/header:opacity-100 transition-opacity" />

                  {/* Group Name */}
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {group.name || `Group ${groupIdx + 1}`}
                  </span>

                  {/* Item Count */}
                  <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 rounded bg-muted">
                    {group.items?.length || 0}
                  </span>

                  {/* Group Actions Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1 rounded hover:bg-accent transition-colors opacity-0 group-hover/header:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {typeof onAddItem === 'function' && (
                        <>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddItem(groupIdx); }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {typeof onMoveGroup === 'function' && (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); onMoveGroup(groupIdx, -1); }}
                            disabled={groupIdx === 0}
                          >
                            <ArrowUp className="h-4 w-4 mr-2" />
                            Move Up
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); onMoveGroup(groupIdx, 1); }}
                            disabled={groupIdx === groups.length - 1}
                          >
                            <ArrowDown className="h-4 w-4 mr-2" />
                            Move Down
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          const newName = prompt('Group name:', group.name || `Group ${groupIdx + 1}`);
                          if (newName) {
                            console.log('Rename group to:', newName);
                          }
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${group.name || `Group ${groupIdx + 1}`}"?`)) {
                            console.log('Delete group:', groupIdx);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Items List */}
                {!isCollapsed && (group.items || []).map((item: any, itemIdx: number) => {
                  const isActive = groupIdx === activeGroupIndex && itemIdx === activeItemIndex;
                  const itemKey = `${groupIdx}-${itemIdx}`;
                  const hasUnsavedChanges = unsavedItems.has(itemKey);

                  return (
                    <div
                      key={itemIdx}
                      className={cn(
                        "group/item flex items-center gap-1 pl-8 pr-2 py-1.5 cursor-pointer transition-all",
                        dragOverItem === itemKey && 'bg-primary/5',
                        isActive 
                          ? 'bg-primary/10 text-primary font-medium border-l-2 border-l-primary' 
                          : 'text-foreground hover:bg-accent/50'
                      )}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', `item:${groupIdx}:${itemIdx}`); setDragItemFrom({ g: groupIdx, i: itemIdx }); }}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDragEnter={() => setDragOverItem(itemKey)}
                      onDragLeave={() => setDragOverItem(null)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOverItem(null);
                        const info = parseDT(e.dataTransfer);
                        if (!info || info.kind !== 'item') return;
                        if (info.g === groupIdx && typeof onReorderItems === 'function') {
                          if (info.i !== itemIdx) onReorderItems(groupIdx, info.i, itemIdx);
                        }
                      }}
                      onClick={() => onItemSelect(groupIdx, itemIdx)}
                    >
                      {/* Drag Handle */}
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0" />

                      {/* Item Label */}
                      <span className="flex-1 text-sm">
                        Item {item.id ?? itemIdx + 1}
                      </span>

                      {/* Unsaved Badge */}
                      {hasUnsavedChanges && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0"
                          title="Unsaved changes"
                        />
                      )}

                      {/* Item Actions Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              "p-1 rounded hover:bg-accent transition-colors flex-shrink-0",
                              isActive ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {typeof onMoveItem === 'function' && (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); onMoveItem(groupIdx, itemIdx, -1); }}
                                disabled={itemIdx === 0}
                              >
                                <ArrowUp className="h-4 w-4 mr-2" />
                                Move Up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); onMoveItem(groupIdx, itemIdx, 1); }}
                                disabled={itemIdx === (group.items?.length || 1) - 1}
                              >
                                <ArrowDown className="h-4 w-4 mr-2" />
                                Move Down
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {typeof onDuplicateItem === 'function' && (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); onDuplicateItem(groupIdx, itemIdx); }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                          )}
                          {typeof onDeleteItem === 'function' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); onDeleteItem(groupIdx, itemIdx); }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {onAddGroup && (
        <div className="p-3 border-t border-border">
          <Button variant="outline" size="sm" className="w-full" onClick={onAddGroup}>
            <Plus className="h-4 w-4 mr-2" />
            Add Group
          </Button>
        </div>
      )}
    </div>
  );
};

