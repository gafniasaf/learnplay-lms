// useState and ChevronDown imports removed - not used
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Child {
  id: string;
  name: string;
  grade: string;
}

interface ChildHeaderProps {
  children: Child[];
  selectedChildId: string;
  onChildChange: (childId: string) => void;
  range: "day" | "week" | "month";
  onRangeChange: (range: "day" | "week" | "month") => void;
  statusOnTrack: boolean;
}

export const ChildHeader = ({
  children,
  selectedChildId,
  onChildChange,
  range,
  onRangeChange,
  statusOnTrack,
}: ChildHeaderProps) => {
  const selectedChild = children.find((c) => c.id === selectedChildId) || children[0];

  return (
    <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b animate-fade-in">
      {/* Left: Child Switcher */}
      <div className="flex items-center gap-3">
        {children.length > 1 ? (
          <Select value={selectedChildId} onValueChange={onChildChange}>
            <SelectTrigger className="w-[200px] h-12 border-2 hover:border-primary/50 transition-colors">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-semibold">
                    {selectedChild.name.charAt(0)}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-semibold text-base">{selectedChild.name}</span>
                    <span className="text-xs text-muted-foreground">{selectedChild.grade}</span>
                  </div>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-background border-2 z-50">
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground text-xs font-semibold">
                      {child.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{child.name}</span>
                      <span className="text-xs text-muted-foreground">{child.grade}</span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold shadow-md">
              {selectedChild.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg">{selectedChild.name}</span>
              <span className="text-sm text-muted-foreground">{selectedChild.grade}</span>
            </div>
          </div>
        )}
      </div>

      {/* Center: Range Selector */}
      <div className="flex items-center gap-1 bg-muted/50 p-1.5 rounded-xl border-2 border-muted shadow-sm">
        {(["day", "week", "month"] as const).map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className={cn(
              "px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200",
              range === r
                ? "bg-background text-foreground shadow-md scale-105 border-2 border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {/* Right: Enhanced Status Badge */}
      <Badge
        variant={statusOnTrack ? "default" : "secondary"}
        className={cn(
          "h-9 px-4 text-sm font-semibold shadow-sm border-2 animate-scale-in",
          statusOnTrack
            ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-600/20"
            : "bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-600/20"
        )}
      >
        <span className="mr-1.5">
          {statusOnTrack ? "✓" : "⚠"}
        </span>
        {statusOnTrack ? "On Track" : "Needs Attention"}
      </Badge>
    </div>
  );
};
