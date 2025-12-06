import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { X, Play, BookOpen, CheckCircle2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import type { KnowledgeObjective, RecommendedCourse } from "@/lib/types/knowledgeMap";
import { getRecommendedCoursesForKO, MOCK_KNOWLEDGE_OBJECTIVES } from "@/lib/mocks/knowledgeMockData";

// Mock mode controlled by env var per IgniteZero rules
const ENV_USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

interface RecommendedCoursesModalProps {
  isOpen: boolean;
  onClose: () => void;
  koId: string;
  studentId: string;
  /**
   * Mock data mode - defaults to env var VITE_USE_MOCK
   */
  useMockData?: boolean;
}

/**
 * RecommendedCoursesModal - Shows courses filtered by Knowledge Objective
 * 
 * Triggered by "Practice Now" buttons in:
 * - SkillCards
 * - BrowseAllSkills
 * 
 * Features:
 * - KO name and description header
 * - Filtered course list with:
 *   - Exercise count for this KO
 *   - Last practiced timestamp
 *   - Overall completion %
 *   - Relevance score (sorted by relevance)
 * - "Start Practice" buttons → /play/:courseId?skillFocus=ko_id
 * - Empty state handling
 */
export function RecommendedCoursesModal({
  isOpen,
  onClose,
  koId,
  studentId,
  useMockData = ENV_USE_MOCK,
}: RecommendedCoursesModalProps) {
  // TODO: Replace with API call when service layer is ready (Task 13)
  const { ko, courses } = useMockData
    ? getMockRecommendedCourses(koId, studentId)
    : { ko: null, courses: [] };

  if (!isOpen || !ko) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex-1 pr-4">
            <h2 className="text-xl font-bold mb-1">{ko.name}</h2>
            {ko.description && (
              <p className="text-sm text-muted-foreground">{ko.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Course list */}
        <ScrollArea className="flex-1 p-6">
          {courses.length === 0 ? (
            <EmptyState koName={ko.name} onClose={onClose} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                {courses.length} course{courses.length !== 1 ? "s" : ""} available to practice{" "}
                <span className="font-medium text-foreground">{ko.name}</span>
              </p>
              {courses.map((course) => (
                <CourseCard key={course.courseId} course={course} koId={koId} />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual course card
 */
function CourseCard({
  course,
  koId,
}: {
  course: RecommendedCourse;
  koId: string;
}) {
  const completionPct = course.completionPct;
  const lastPracticedDays = course.lastPracticed
    ? Math.floor(
        (Date.now() - new Date(course.lastPracticed).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  // Relevance badge color
  const relevanceColor =
    course.relevance >= 0.8
      ? "bg-success/10 text-success border-success/30"
      : course.relevance >= 0.5
      ? "bg-warning/10 text-warning border-warning/30"
      : "bg-muted text-muted-foreground border-muted";

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      {/* Header: Course title + relevance */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight">{course.courseTitle}</h3>
        </div>
        {course.relevance > 0 && (
          <Badge variant="outline" className={`flex-shrink-0 ${relevanceColor}`}>
            {Math.round(course.relevance * 100)}% match
          </Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {/* Exercise count */}
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          <span>
            <span className="font-medium text-foreground">{course.exerciseCount}</span>{" "}
            exercise{course.exerciseCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Last practiced */}
        {lastPracticedDays !== null && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {lastPracticedDays === 0
                ? "Today"
                : lastPracticedDays === 1
                ? "Yesterday"
                : `${lastPracticedDays}d ago`}
            </span>
          </div>
        )}

        {/* Overall completion */}
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{completionPct}% complete</span>
        </div>
      </div>

      {/* Completion progress bar */}
      {completionPct > 0 && (
        <div className="space-y-1">
          <Progress value={completionPct} className="h-1.5" />
        </div>
      )}

      {/* Action button */}
      <Button className="w-full h-9" asChild>
        <Link to={`/play/${course.courseId}/welcome?skillFocus=${koId}`}>
          <Play className="h-4 w-4 mr-2" aria-hidden="true" />
          {completionPct === 0
            ? "Start Practice"
            : completionPct < 100
            ? "Continue Practice"
            : "Review"}
        </Link>
      </Button>
    </div>
  );
}

/**
 * Empty state when no courses available
 */
function EmptyState({ koName, onClose }: { koName: string; onClose: () => void }) {
  return (
    <div className="text-center py-12">
      <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">No Courses Available</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
        We don't have any courses yet for practicing{" "}
        <span className="font-medium text-foreground">{koName}</span>. Check back soon as we
        add more content!
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button asChild>
          <Link to="/courses">
            Browse All Courses
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Mock data loader
 * TODO: Replace with API call
 */
function getMockRecommendedCourses(
  koId: string,
  studentId: string
): {
  ko: KnowledgeObjective | null;
  courses: RecommendedCourse[];
} {
  const ko = MOCK_KNOWLEDGE_OBJECTIVES.find((k: KnowledgeObjective) => k.id === koId);

  if (!ko) {
    return { ko: null, courses: [] };
  }

  // Get recommended courses using existing helper
  const courses = getRecommendedCoursesForKO(koId, studentId);

  return { ko, courses };
}
