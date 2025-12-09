import { useState } from "react";
import { Button } from "@/components/ui/button";
// Badge import removed - not used
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Brain,
  Target,
  BookOpen,
  Info,
  CheckCircle2,
} from "lucide-react";
import type {
  KnowledgeObjective,
  AssignmentMode,
  CompletionCriteria,
  RecommendedCourse,
} from "@/lib/types/knowledgeMap";
import { MOCK_KNOWLEDGE_OBJECTIVES } from "@/lib/mocks/knowledgeMockData";

// Mock mode controlled by env var per IgniteZero rules
const ENV_USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  koId: string;
  /**
   * User creating the assignment (teacher or parent)
   */
  assignerId: string;
  assignerRole: "teacher" | "parent";
  /**
   * Class or child ID for filtering students
   */
  contextId: string;
  /**
   * Callback when assignment is created
   */
  onCreateAssignment?: (data: AssignmentCreationData) => void;
  /**
   * Mock data mode - defaults to env var VITE_USE_MOCK
   */
  useMockData?: boolean;
}

export interface AssignmentCreationData {
  studentIds: string[];
  koId: string;
  courseId?: string;
  mode: AssignmentMode;
  completionCriteria: CompletionCriteria;
  useAIRecommendation: boolean;
}

/**
 * AssignmentModal - Comprehensive assignment creation interface
 * 
 * Three modes:
 * 1. Manual: Teacher/parent picks course manually
 * 2. AI-Assisted: AI recommends best course with rationale
 * 3. Fully Autonomous: Enable continuous AI-driven assignments
 * 
 * Features:
 * - Student multi-select (or all students)
 * - Course recommendation list (filtered by KO)
 * - Completion criteria config:
 *   - Primary KPI: Mastery score / Exercise count / Hybrid
 *   - Target mastery % (default 75%)
 *   - Min evidence attempts (default 10)
 *   - Optional due date
 * - Parent permission check (blocked if teacher has assignment)
 * - AI confidence display
 */
export function AssignmentModal({
  isOpen,
  onClose,
  koId,
  assignerId,
  assignerRole,
  contextId,
  onCreateAssignment,
  useMockData = ENV_USE_MOCK,
}: AssignmentModalProps) {
  // Mode selection
  const [mode, setMode] = useState<AssignmentMode>("manual");

  // Student selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Course selection
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // Completion criteria
  const [primaryKPI, setPrimaryKPI] = useState<"mastery_score" | "exercise_count" | "hybrid">(
    "mastery_score"
  );
  const [targetMastery, setTargetMastery] = useState(75);
  const [minEvidence, setMinEvidence] = useState(10);
  const [targetExerciseCount, setTargetExerciseCount] = useState(20);
  const [dueDate, setDueDate] = useState("");
  const [requireBoth, setRequireBoth] = useState(false);

  // Data source: mock data for development, empty defaults for live mode
  const { ko, students, courses, aiRecommendation, permissions } = useMockData
    ? getMockAssignmentData(koId, contextId, assignerRole)
    : {
        ko: null,
        students: [],
        courses: [],
        aiRecommendation: null,
        permissions: { canAssign: true },
      };

  if (!isOpen || !ko) return null;

  // Permission check
  if (!permissions.canAssign) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="h-5 w-5 text-warning mt-0.5" />
            <div>
              <h3 className="font-semibold mb-1">Cannot Assign Practice</h3>
              <p className="text-sm text-muted-foreground">
                {permissions.reason === "has_teacher"
                  ? `${permissions.teacherName || "A teacher"} has already assigned this skill. Parents cannot override teacher assignments.`
                  : "You don't have permission to assign this skill."}
              </p>
            </div>
          </div>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    const criteria: CompletionCriteria = {
      primary_kpi: primaryKPI,
      target_mastery: targetMastery / 100,
      min_evidence: minEvidence,
    };

    if (primaryKPI === "exercise_count" || primaryKPI === "hybrid") {
      criteria.target_exercise_count = targetExerciseCount;
    }

    if (primaryKPI === "hybrid") {
      criteria.require_both = requireBoth;
    }

    if (dueDate) {
      criteria.due_date = new Date(dueDate).toISOString();
    }

    const studentsToAssign = selectAll
      ? students.map((s) => s.id)
      : selectedStudentIds;

    onCreateAssignment?.({
      studentIds: studentsToAssign,
      koId,
      courseId: mode === "autonomous" ? undefined : selectedCourseId,
      mode,
      completionCriteria: criteria,
      useAIRecommendation: mode === "ai_assisted" && !!aiRecommendation,
    });

    onClose();
  };

  const isValid =
    (selectAll || selectedStudentIds.length > 0) &&
    (mode === "autonomous" || selectedCourseId);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex-1 pr-4">
            <h2 className="text-xl font-bold mb-1">Assign Practice</h2>
            <p className="text-sm text-muted-foreground">{ko.name}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {/* Mode selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Assignment Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                <ModeButton
                  mode="manual"
                  active={mode === "manual"}
                  onClick={() => setMode("manual")}
                  icon={<BookOpen className="h-4 w-4" />}
                  label="Manual"
                  description="Pick course yourself"
                />
                <ModeButton
                  mode="ai_assisted"
                  active={mode === "ai_assisted"}
                  onClick={() => setMode("ai_assisted")}
                  icon={<Brain className="h-4 w-4" />}
                  label="AI-Assisted"
                  description="Get AI recommendation"
                />
                <ModeButton
                  mode="autonomous"
                  active={mode === "autonomous"}
                  onClick={() => setMode("autonomous")}
                  icon={<Target className="h-4 w-4" />}
                  label="Autonomous"
                  description="Enable auto-assign"
                />
              </div>
            </div>

            {/* Student selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Students</Label>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  checked={selectAll}
                  onCheckedChange={(checked) => {
                    setSelectAll(!!checked);
                    if (checked) {
                      setSelectedStudentIds([]);
                    }
                  }}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-sm cursor-pointer">
                  Assign to all students ({students.length})
                </label>
              </div>
              {!selectAll && (
                <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
                  {students.map((student) => (
                    <div key={student.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedStudentIds.includes(student.id)}
                        onCheckedChange={(checked) => {
                          setSelectedStudentIds((prev) =>
                            checked
                              ? [...prev, student.id]
                              : prev.filter((id) => id !== student.id)
                          );
                        }}
                        id={student.id}
                      />
                      <label
                        htmlFor={student.id}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {student.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Course selection (Manual/AI-Assisted only) */}
            {mode !== "autonomous" && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  {mode === "ai_assisted" ? "Recommended Course" : "Select Course"}
                </Label>
                {mode === "ai_assisted" && aiRecommendation && (
                  <div className="bg-primary/10 border border-primary/30 rounded-md p-3 space-y-2 mb-2">
                    <div className="flex items-start gap-2">
                      <Brain className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          AI Recommendation: {aiRecommendation.courseTitle}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {aiRecommendation.rationale}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Confidence: {Math.round(aiRecommendation.confidence * 100)}% •
                          Est. {aiRecommendation.estimatedSessions} sessions (
                          {aiRecommendation.estimatedMinutes} min)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.courseId} value={course.courseId}>
                        {course.courseTitle} ({course.exerciseCount} exercises)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Autonomous mode info */}
            {mode === "autonomous" && (
              <div className="bg-muted/50 border rounded-md p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Target className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Autonomous Assignment Mode</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      AI will continuously recommend and assign the best courses based on
                      student performance. Assignments will be created automatically when
                      mastery falls below the threshold or when previous assignments
                      complete.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Completion criteria */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Completion Criteria</Label>

              {/* Primary KPI */}
              <div className="space-y-2">
                <Label className="text-xs">Primary Goal</Label>
                <Select
                  value={primaryKPI}
                  onValueChange={(v: any) => setPrimaryKPI(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mastery_score">
                      Mastery Score (recommended)
                    </SelectItem>
                    <SelectItem value="exercise_count">Exercise Count</SelectItem>
                    <SelectItem value="hybrid">Hybrid (both)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mastery target */}
              {(primaryKPI === "mastery_score" || primaryKPI === "hybrid") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Target Mastery</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={targetMastery}
                        onChange={(e) =>
                          setTargetMastery(parseInt(e.target.value) || 75)
                        }
                        className="text-sm"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Attempts</Label>
                    <Input
                      type="number"
                      min={1}
                      value={minEvidence}
                      onChange={(e) => setMinEvidence(parseInt(e.target.value) || 10)}
                      className="text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Exercise count */}
              {(primaryKPI === "exercise_count" || primaryKPI === "hybrid") && (
                <div className="space-y-1">
                  <Label className="text-xs">Target Exercise Count</Label>
                  <Input
                    type="number"
                    min={1}
                    value={targetExerciseCount}
                    onChange={(e) =>
                      setTargetExerciseCount(parseInt(e.target.value) || 20)
                    }
                    className="text-sm"
                  />
                </div>
              )}

              {/* Hybrid option */}
              {primaryKPI === "hybrid" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={requireBoth}
                    onCheckedChange={(checked) => setRequireBoth(!!checked)}
                    id="require-both"
                  />
                  <label htmlFor="require-both" className="text-xs cursor-pointer">
                    Require both mastery AND exercise count (otherwise either)
                  </label>
                </div>
              )}

              {/* Due date */}
              <div className="space-y-1">
                <Label className="text-xs">Due Date (optional)</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-sm"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {selectAll
              ? `${students.length} students`
              : `${selectedStudentIds.length} student(s) selected`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Create Assignment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mode selection button
 */
function ModeButton({
  mode,
  active,
  onClick,
  icon,
  label,
  description,
}: {
  mode: AssignmentMode;
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-md border text-left transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card hover:bg-muted/50 border-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-xs opacity-90">{description}</p>
    </button>
  );
}

/**
 * Mock data generator for development mode
 * Live mode uses createAssignment/getRecommendedCourses from knowledgeMap.ts
 */
function getMockAssignmentData(
  koId: string,
  contextId: string,
  role: "teacher" | "parent"
): {
  ko: KnowledgeObjective;
  students: Array<{ id: string; name: string }>;
  courses: RecommendedCourse[];
  aiRecommendation: {
    courseId: string;
    courseTitle: string;
    rationale: string;
    confidence: number;
    estimatedSessions: number;
    estimatedMinutes: number;
  } | null;
  permissions: { canAssign: boolean; reason?: string; teacherName?: string };
} {
  const ko = MOCK_KNOWLEDGE_OBJECTIVES.find((k: any) => k.id === koId);

  return {
    ko: ko || MOCK_KNOWLEDGE_OBJECTIVES[0],
    students: [
      { id: "student-2", name: "Bailey Johnson" },
      { id: "student-5", name: "Elliot Martinez" },
    ],
    courses: [
      {
        courseId: "multiplication",
        courseTitle: "Multiplication Mastery",
        exerciseCount: 30,
        completionPct: 45,
        relevance: 1.0,
      },
      {
        courseId: "arithmetic-grade4",
        courseTitle: "Grade 4 Arithmetic",
        exerciseCount: 20,
        completionPct: 28,
        relevance: 0.8,
      },
    ],
    aiRecommendation: {
      courseId: "multiplication",
      courseTitle: "Multiplication Mastery",
      rationale:
        "This course has the highest concentration of relevant exercises and aligns well with the student's current skill level.",
      confidence: 0.87,
      estimatedSessions: 5,
      estimatedMinutes: 75,
    },
    permissions: {
      canAssign: true,
    },
  };
}
