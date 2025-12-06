import { cn } from "@/lib/utils";
import type { CourseGroup } from "@/lib/types/course";

interface GroupGridProps {
  groups: CourseGroup[];
  visibleGroupIds: number[];
  onSelectGroup?: (groupId: number) => void;
  disabled?: boolean;
}

/**
 * GroupGrid - Display category/group buttons for legacy "category mode"
 * Shows groups that are visible in the current level range
 */
export const GroupGrid = ({
  groups,
  visibleGroupIds,
  onSelectGroup,
  disabled = false,
}: GroupGridProps) => {
  // Filter groups to only show those in the visible range
  const visibleGroups = groups.filter((g) => visibleGroupIds.includes(g.id));

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <div 
      className="w-full max-w-4xl"
      role="group"
      aria-label="Category groups"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {visibleGroups.map((group) => (
          <button
            key={group.id}
            onClick={() => !disabled && onSelectGroup?.(group.id)}
            disabled={disabled}
            className={cn(
              "p-4 rounded-lg text-sm font-medium transition-all",
              "border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "hover:scale-[1.02] active:scale-[0.98]",
              "bg-card border-border hover:border-primary hover:shadow-md",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{
              backgroundColor: group.color 
                ? `${group.color}15` 
                : undefined,
              borderColor: group.color || undefined,
            }}
            aria-label={`Group ${group.id + 1}: ${group.name}`}
          >
            <div className="flex flex-col items-center gap-1">
              <span 
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  "bg-secondary text-secondary-foreground"
                )}
                style={{
                  backgroundColor: group.color || undefined,
                  color: group.color ? '#fff' : undefined,
                }}
              >
                {group.id + 1}
              </span>
              <span className="text-center line-clamp-2">{group.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
