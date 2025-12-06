import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, AlertTriangle, Target, TrendingUp, Plus, List } from "lucide-react";
import type { ClassKOSummary } from "@/lib/types/knowledgeMap";
import { useState } from "react";

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
  /**
   * Mock data mode
   */
  useMockData?: boolean;
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
  useMockData = true,
}: ClassFocusWidgetProps) {
  // TODO: Replace with useClassKOSummary hook when created (Task 14)
  const summary = useMockData ? getMockClassKOSummary(classId) : null;

  if (!summary) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Class Focus</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Loading class data...</p>
        </CardContent>
      </Card>
    );
  }

  const { urgent, opportunity, strong } = summary;
  const topFive = [...urgent.slice(0, 1), ...opportunity.slice(0, 2), ...strong.slice(0, 2)];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Class Pulse</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Top {topFive.length}
            </Badge>
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
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {topFive.length === 0 ? (
          <div className="text-center py-8">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No skills data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Students need to start practicing to see class insights
            </p>
          </div>
        ) : (
          topFive.map((ko) => <ClassKORow key={ko.koId} ko={ko} onCreateAssignment={onCreateAssignment} />)
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Individual KO row in the widget
 */
function ClassKORow({
  ko,
  onCreateAssignment,
}: {
  ko: ClassKOSummary;
  onCreateAssignment?: (koId: string) => void;
}) {
  const avgMasteryPct = Math.round(ko.avgMastery * 100);
  const statusInfo = getStatusInfo(ko.status);
  const strugglingPct = Math.round((ko.strugglingCount / ko.totalStudents) * 100);

  return (
    <div className={`p-3 rounded-md border ${statusInfo.bg} space-y-2.5`}>
      {/* Header: KO name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="mt-0.5">{statusInfo.icon}</div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium leading-tight">{ko.koName}</h4>
            {ko.topicClusterId && (
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {ko.topicClusterId.split(".")[1] || ko.topicClusterId}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={`flex-shrink-0 ${statusInfo.badge}`}>
          {avgMasteryPct}%
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress
          value={avgMasteryPct}
          className={`h-1.5 ${statusInfo.progressColor}`}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {/* Total students */}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {ko.totalStudents} student{ko.totalStudents !== 1 ? "s" : ""}
            </span>
            {/* Struggling count */}
            {ko.strugglingCount > 0 && (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" />
                {ko.strugglingCount} struggling ({strugglingPct}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        onClick={() => onCreateAssignment?.(ko.koId)}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Assign Practice
      </Button>
    </div>
  );
}

/**
 * Get status styling
 */
function getStatusInfo(status: "urgent" | "opportunity" | "strong"): {
  icon: JSX.Element;
  bg: string;
  badge: string;
  progressColor: string;
} {
  switch (status) {
    case "urgent":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
        bg: "bg-destructive/5 border-destructive/30",
        badge: "border-destructive/30 text-destructive",
        progressColor: "[&>div]:bg-destructive",
      };
    case "opportunity":
      return {
        icon: <Target className="h-4 w-4 text-warning" />,
        bg: "bg-warning/5 border-warning/20",
        badge: "border-warning/30 text-warning",
        progressColor: "[&>div]:bg-warning",
      };
    case "strong":
      return {
        icon: <TrendingUp className="h-4 w-4 text-success" />,
        bg: "bg-success/5 border-success/20",
        badge: "border-success/30 text-success",
        progressColor: "[&>div]:bg-success",
      };
  }
}

/**
 * Mock data generator
 * TODO: Replace with API call
 */
function getMockClassKOSummary(classId: string): {
  urgent: ClassKOSummary[];
  opportunity: ClassKOSummary[];
  strong: ClassKOSummary[];
  totalKOs: number;
} {
  // Mock: Teacher has 2 students (Bailey and Elliot) in their class
  const totalStudents = 2;

  return {
    urgent: [
      {
        classId,
        className: "Math 4A",
        koId: "ko-math-002",
        koName: "Two-digit addition with regrouping",
        domain: "math",
        topicClusterId: "math.arithmetic",
        totalStudents,
        strugglingCount: 2, // Both struggling
        avgMastery: 0.35,
        lastPracticed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: "urgent",
      },
    ],
    opportunity: [
      {
        classId,
        className: "Math 4A",
        koId: "ko-math-005",
        koName: "Multiplication tables (6-10)",
        domain: "math",
        topicClusterId: "math.arithmetic",
        totalStudents,
        strugglingCount: 1, // Elliot struggling
        avgMastery: 0.52,
        lastPracticed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        status: "opportunity",
      },
      {
        classId,
        className: "Math 4A",
        koId: "ko-math-011",
        koName: "Understanding fractions",
        domain: "math",
        topicClusterId: "math.fractions",
        totalStudents,
        strugglingCount: 1,
        avgMastery: 0.58,
        lastPracticed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: "opportunity",
      },
    ],
    strong: [
      {
        classId,
        className: "Math 4A",
        koId: "ko-math-004",
        koName: "Multiplication tables (1-5)",
        domain: "math",
        topicClusterId: "math.arithmetic",
        totalStudents,
        strugglingCount: 0,
        avgMastery: 0.78,
        lastPracticed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        status: "strong",
      },
      {
        classId,
        className: "Math 4A",
        koId: "ko-math-001",
        koName: "Single-digit addition",
        domain: "math",
        topicClusterId: "math.arithmetic",
        totalStudents,
        strugglingCount: 0,
        avgMastery: 0.85,
        lastPracticed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "strong",
      },
    ],
    totalKOs: 52, // Total KOs in system
  };
}
