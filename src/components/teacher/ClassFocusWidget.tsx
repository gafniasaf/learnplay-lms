import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Target, List } from "lucide-react";

interface ClassFocusWidgetProps {
  classId: string;
  /**
   * Callback when "Create Assignment" is clicked
   */
  onCreateAssignment?: (koId: string) => void;
  /**
   * Callback when "View All Skills" is clicked
   */
  onViewAll?: () => void;
}

/**
 * ClassFocusWidget - Teacher's "Class Pulse" priority KO view
 * 
 * Shows top 5 Knowledge Objectives prioritized by need:
 * - 1 red urgent (avg mastery <50%, many struggling)
 * - 2 yellow opportunity (avg mastery 50-69%)
 * - 2 green strong (avg mastery ≥70%, for reinforcement)
 * 
 * Features:
 * - Student count + struggling count
 * - Average mastery progress bar
 * - Color-coded status (red/yellow/green)
 * - "Create Assignment" quick action per KO
 * - "View All Skills" button → full TeacherKOTable modal
 * 
 * Positioned at top of TeacherDashboard as priority card
 */
export function ClassFocusWidget({
  classId,
  onCreateAssignment,
  onViewAll,
}: ClassFocusWidgetProps) {
  // Knowledge Map class-level aggregation is not yet enabled in live mode.
  // We intentionally show an explicit BLOCKED state rather than mock data.
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Class Pulse</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onViewAll}
          >
            <List className="h-3.5 w-3.5 mr-1" />
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <AlertDescription>
            Knowledge Map class insights are <span className="font-medium">not enabled</span> yet.
            This widget will show priority skills once class aggregation is implemented.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
