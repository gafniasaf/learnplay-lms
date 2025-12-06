import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { ClipboardList, Play, CheckCircle2, AlertCircle, Clock, User, Brain } from "lucide-react";
import type { AssignmentWithDetails } from "@/lib/types/knowledgeMap";
import { useStudentAssignments } from "@/hooks/useStudentAssignments";
import { Skeleton } from "@/components/ui/skeleton";

// Mock mode controlled by env var per IgniteZero rules
const ENV_USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

interface StudentAssignmentsProps {
  studentId: string;
  /**
   * Mock data mode - defaults to env var VITE_USE_MOCK
   */
  useMockData?: boolean;
}

/**
 * StudentAssignments - Shows active Knowledge Objective assignments
 * 
 * Displays assignments from teachers, parents, or AI with:
 * - Progress bars (current mastery → target mastery)
 * - Completion status (active/overdue)
 * - Assigned by indicator (teacher/parent/AI)
 * - Course info and practice buttons
 * - Due date countdown
 * 
 * Positioned above "My Focus" cards in student dashboard
 */
export function StudentAssignments({ studentId, useMockData = ENV_USE_MOCK }: StudentAssignmentsProps) {
  // When mock mode is enabled (storybook/e2e), continue to show local mock data.
  // In live mode, use the real assignments hook wired to Edge functions.
  const { data, isLoading, isError } = useStudentAssignments({ enabled: !useMockData });
  const assignments = useMockData
    ? getMockAssignments(studentId)
    : (data?.assignments as unknown as AssignmentWithDetails[] | undefined) ?? [];

  // Filter active/overdue only (completed assignments shown elsewhere)
  const activeAssignments = assignments.filter(
    (a) => a.status === "active" || a.status === "overdue"
  );

  if (isLoading && !useMockData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">My Assignments</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if ((activeAssignments.length === 0 && !isLoading) || isError) {
    return null; // Hide card when no assignments or on error (graceful)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">My Assignments</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {activeAssignments.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeAssignments.map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Individual assignment card
 */
function AssignmentCard({ assignment }: { assignment: AssignmentWithDetails }) {
  const isOverdue = assignment.status === "overdue";
  const masteryPct = Math.round(assignment.currentMastery * 100);
  const targetMasteryPct = Math.round(
    (assignment.completionCriteria.target_mastery || 0.75) * 100
  );
  const progressPct = assignment.progressPercentage;
  const isNew = assignment.createdAt ? (Date.now() - new Date(assignment.createdAt).getTime() < 24 * 3600_000) : false;

  // Determine primary KPI display
  const isPrimaryMastery = assignment.completionCriteria.primary_kpi === "mastery_score";
  const isPrimaryExercises = assignment.completionCriteria.primary_kpi === "exercise_count";

  // Assigned by icon and label
  const assignerInfo = getAssignerInfo(assignment.assignedByRole, assignment.assignedByName);

  return (
    <div
      className={`p-3 rounded-md border space-y-2.5 ${
        isOverdue
          ? "bg-destructive/5 border-destructive/30"
          : "bg-card border-border"
      }`}
    >
      {/* Header: Skill name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium leading-tight truncate">
            {assignment.ko.name}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {assignment.courseName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isNew && (
            <Badge variant="secondary" className="flex-shrink-0">
              New
            </Badge>
          )}
          <Badge
          variant={isOverdue ? "destructive" : "default"}
          className="flex-shrink-0"
        >
          {isOverdue ? (
            <>
              <AlertCircle className="h-3 w-3 mr-1" />
              Overdue
            </>
          ) : (
            <>
              <Clock className="h-3 w-3 mr-1" />
              Active
            </>
          )}
          </Badge>
        </div>
      </div>

      {/* Assigned by indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {assignerInfo.icon}
        <span>
          Assigned by{" "}
          <span className="font-medium text-foreground">{assignerInfo.label}</span>
        </span>
      </div>

      {/* Progress section */}
      <div className="space-y-2">
        {/* Primary progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {isPrimaryMastery && "Mastery Progress"}
              {isPrimaryExercises && "Exercise Progress"}
              {!isPrimaryMastery && !isPrimaryExercises && "Progress"}
            </span>
            <span className="text-muted-foreground">
              {isPrimaryMastery && `${masteryPct}% → ${targetMasteryPct}%`}
              {isPrimaryExercises &&
                `${assignment.progressCurrent} / ${assignment.progressTarget}`}
              {!isPrimaryMastery &&
                !isPrimaryExercises &&
                `${progressPct}%`}
            </span>
          </div>
          <Progress
            value={progressPct}
            className={`h-2 ${
              isOverdue
                ? "[&>div]:bg-destructive"
                : progressPct >= 80
                ? "[&>div]:bg-success"
                : ""
            }`}
          />
        </div>

        {/* Secondary info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {/* Mastery indicator (if not primary) */}
            {!isPrimaryMastery && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {masteryPct}% mastery
              </span>
            )}
            {/* Evidence count */}
            {assignment.completionCriteria.min_evidence && (
              <span>
                {assignment.progressCurrent} /{" "}
                {assignment.completionCriteria.min_evidence} attempts
              </span>
            )}
          </div>

          {/* Due date */}
          {assignment.daysUntilDue !== undefined && (
            <span
              className={`flex items-center gap-1 ${
                assignment.daysUntilDue < 0
                  ? "text-destructive font-medium"
                  : assignment.daysUntilDue <= 2
                  ? "text-warning font-medium"
                  : ""
              }`}
            >
              <Clock className="h-3 w-3" />
              {assignment.daysUntilDue < 0
                ? `${Math.abs(assignment.daysUntilDue)}d overdue`
                : assignment.daysUntilDue === 0
                ? "Due today"
                : `${assignment.daysUntilDue}d left`}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-8 text-xs" asChild>
          <Link
            to={`/play/${assignment.courseId}/welcome?skillFocus=${assignment.koId}`}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {assignment.progressCurrent === 0 ? "Start Practice" : "Continue"}
          </Link>
        </Button>
        {assignment.llmRationale && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            title={assignment.llmRationale}
          >
            <Brain className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">AI Rationale</span>
          </Button>
        )}
      </div>

      {/* AI rationale tooltip (if present) */}
      {assignment.llmRationale && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-sm border">
          <div className="flex items-start gap-1.5">
            <Brain className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">{assignment.llmRationale}</p>
          </div>
          {assignment.llmConfidence !== undefined && (
            <p className="mt-1 text-xs opacity-70">
              Confidence: {Math.round(assignment.llmConfidence * 100)}%
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get assigner icon and label
 */
function getAssignerInfo(
  role: "teacher" | "parent" | "ai_autonomous",
  name?: string
): { icon: JSX.Element; label: string } {
  switch (role) {
    case "teacher":
      return {
        icon: <User className="h-3 w-3" />,
        label: name || "Teacher",
      };
    case "parent":
      return {
        icon: <User className="h-3 w-3" />,
        label: name || "Parent",
      };
    case "ai_autonomous":
      return {
        icon: <Brain className="h-3 w-3" />,
        label: "AI System",
      };
  }
}

/**
 * Mock data generator for development mode
 * Live mode uses getStudentAssignments from knowledgeMap.ts
 */
function getMockAssignments(studentId: string): AssignmentWithDetails[] {
  // Mock: Student has 2 active assignments (1 from teacher, 1 overdue)
  const now = Date.now();

  return [
    // Active assignment from teacher
    {
      id: "assign-001",
      studentId,
      koId: "ko-math-005",
      courseId: "multiplication",
      assignedBy: "teacher-1",
      assignedByRole: "teacher",
      completionCriteria: {
        primary_kpi: "mastery_score",
        target_mastery: 0.75,
        min_evidence: 10,
      },
      status: "active",
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ko: {
        id: "ko-math-005",
        name: "Multiplication tables (6-10)",
        description: "Recall multiplication facts 6×1 through 10×10",
        domain: "math",
        topicClusterId: "math.arithmetic",
        prerequisites: ["ko-math-004"],
        examples: [],
        difficulty: 0.5,
        levelScore: 35,
        status: "published",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      courseName: "Multiplication Mastery",
      currentMastery: 0.52,
      progressCurrent: 8,
      progressTarget: 10,
      progressPercentage: 69, // 52/75 mastery progress
      daysUntilDue: 7,
      assignedByName: "Mrs. Johnson",
    },
    // Overdue assignment
    {
      id: "assign-003",
      studentId,
      koId: "ko-math-002",
      courseId: "arithmetic-grade4",
      assignedBy: "teacher-1",
      assignedByRole: "teacher",
      completionCriteria: {
        primary_kpi: "mastery_score",
        target_mastery: 0.7,
        min_evidence: 10,
      },
      status: "overdue",
      createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      ko: {
        id: "ko-math-002",
        name: "Two-digit addition with regrouping",
        description: "Add two-digit numbers requiring carrying",
        domain: "math",
        topicClusterId: "math.arithmetic",
        prerequisites: ["ko-math-001"],
        examples: [],
        difficulty: 0.4,
        levelScore: 25,
        status: "published",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      courseName: "Grade 4 Arithmetic",
      currentMastery: 0.35,
      progressCurrent: 4,
      progressTarget: 10,
      progressPercentage: 50, // 35/70 mastery progress
      daysUntilDue: -2,
      assignedByName: "Mrs. Johnson",
    },
    // AI-assigned (autonomous) - only if student has auto-assign enabled
    // Uncomment if testing autonomous assignments
    /*
    {
      id: "assign-004",
      studentId,
      koId: "ko-math-012",
      courseId: "fractions-grade5",
      assignedBy: "ai-system",
      assignedByRole: "ai_autonomous",
      completionCriteria: {
        primary_kpi: "mastery_score",
        target_mastery: 0.8,
        min_evidence: 12,
      },
      llmRationale:
        "Student has mastered basic fractions. Ready for equivalent fractions with high confidence based on recent performance.",
      llmConfidence: 0.85,
      status: "active",
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      ko: {
        id: "ko-math-012",
        name: "Equivalent fractions",
        description: "Identify and create equivalent fractions",
        domain: "math",
        topicClusterId: "math.fractions",
        prerequisites: ["ko-math-011"],
        examples: [],
        difficulty: 0.5,
        levelScore: 35,
        status: "published",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      courseName: "Fractions & Decimals",
      currentMastery: 0.48,
      progressCurrent: 6,
      progressTarget: 12,
      progressPercentage: 60,
      assignedByName: undefined,
    },
    */
  ];
}
