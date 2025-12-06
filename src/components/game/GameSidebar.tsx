import { Home, Volume2, VolumeX, Grid3x3, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StudyTextsDrawer } from "@/components/learning/StudyTextsDrawer";
import { isDevEnabled } from "@/lib/env";
import { cn } from "@/lib/utils";

interface GameSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  currentLevel: number;
  levels?: Array<{ id: number; title: string }>;
  onLevelChange: (level: string) => void;
  levelChangeDisabled?: boolean;
  dataSource?: "live" | "mock";
  studyTexts?: any[];
  currentItemRelatedIds?: number[];
  score: number;
  mistakes: number;
  itemsRemaining: number;
  elapsedTime: number;
  ttsEnabled: boolean;
  hasTTS: boolean;
  onToggleTTS: () => void;
  categoryMode: boolean;
  onToggleCategoryMode: () => void;
  onExit: () => void;
}

export const GameSidebar = ({
  isOpen,
  onClose,
  courseTitle,
  currentLevel,
  levels,
  onLevelChange,
  levelChangeDisabled,
  dataSource,
  studyTexts,
  currentItemRelatedIds,
  score,
  mistakes,
  itemsRemaining,
  elapsedTime,
  ttsEnabled,
  hasTTS,
  onToggleTTS,
  categoryMode,
  onToggleCategoryMode,
  onExit,
}: GameSidebarProps) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-80 bg-background border-r border-border shadow-lg z-50",
          "transition-transform duration-300 ease-in-out",
          "flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Game menu"
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold mb-1">{courseTitle}</h2>
          {isDevEnabled() && dataSource && (
            <Badge
              variant={dataSource === "live" ? "default" : "secondary"}
              className="text-xs"
            >
              {dataSource.toUpperCase()}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Level Selector */}
          {levels && levels.length > 1 && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Current Level
              </label>
              <Select
                value={currentLevel.toString()}
                onValueChange={onLevelChange}
                disabled={levelChangeDisabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id.toString()}>
                      {level.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Stats Grid */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
              Session Stats
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl mb-1">🏆</div>
                <div className="text-lg font-bold">{score}</div>
                <div className="text-xs text-muted-foreground">Correct</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl mb-1">❌</div>
                <div className="text-lg font-bold">{mistakes}</div>
                <div className="text-xs text-muted-foreground">Mistakes</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl mb-1">⏱️</div>
                <div className="text-lg font-bold">{formatTime(elapsedTime)}</div>
                <div className="text-xs text-muted-foreground">Time</div>
              </div>
            </div>
            <div className="mt-3 text-center p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">
                {itemsRemaining} question{itemsRemaining !== 1 ? "s" : ""} remaining
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {/* Study Materials */}
            {studyTexts && studyTexts.length > 0 && (
              <StudyTextsDrawer
                courseTitle={courseTitle}
                studyTexts={studyTexts}
                currentItemRelatedIds={(currentItemRelatedIds || []).map(String)}
              />
            )}

            {/* Sound Toggle */}
            {hasTTS && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={onToggleTTS}
              >
                {ttsEnabled ? (
                  <Volume2 className="h-4 w-4 mr-2" />
                ) : (
                  <VolumeX className="h-4 w-4 mr-2" />
                )}
                Sound {ttsEnabled ? "On" : "Off"}
              </Button>
            )}

            {/* Category Mode Toggle */}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onToggleCategoryMode}
            >
              <Grid3x3 className="h-4 w-4 mr-2" />
              {categoryMode ? "Option Mode" : "Category Mode"}
            </Button>

            {/* Exit */}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onExit}
            >
              <Home className="h-4 w-4 mr-2" />
              Exit to Home
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};
