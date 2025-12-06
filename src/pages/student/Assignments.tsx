import { useMemo } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { useStudentAssignments } from "@/hooks/useStudentAssignments";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { shouldUseMockData } from "@/lib/api/common";
import { getAssignmentsDue } from "@/lib/student/mockSelectors";
import { mapStudentAssignment, type StudentAssignmentDisplay } from "@/lib/student/assignmentsMappers";

const mapMockAssignments = (): StudentAssignmentDisplay[] => {
  // Use a simple, coarse window for mock assignments; real implementation is in mockSelectors.
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);

  const window = { startDate, endDate: now };
  return getAssignmentsDue(window).map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    courseId: assignment.subject,
    dueAt: assignment.dueISO ?? null,
  }));
};

export default function StudentAssignments() {
  const navigate = useNavigate();
  const mockMode = shouldUseMockData();
  const { data, isLoading, isError, error, refetch } = useStudentAssignments({ enabled: !mockMode });

  const liveAssignments = useMemo(() => {
    if (mockMode || !data?.assignments) return [];
    return data.assignments.map(mapStudentAssignment);
  }, [mockMode, data?.assignments]);

  const fallbackAssignments = useMemo(() => mapMockAssignments(), []);

  const assignments = liveAssignments.length > 0 ? liveAssignments : fallbackAssignments;

  if (!mockMode && isLoading) {
    return (
      <PageContainer>
        <StudentLayout>
          <div className="p-8 text-center text-muted-foreground">Loading assignments…</div>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (!mockMode && isError) {
    const message = error instanceof Error ? error.message : "Unable to load assignments.";

    return (
      <PageContainer>
        <StudentLayout>
          <Alert variant="destructive" className="max-w-xl">
            <AlertTitle>Unable to load assignments</AlertTitle>
            <AlertDescription>
              <p className="mb-4">{message}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </StudentLayout>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <StudentLayout>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">My Assignments</h1>
            <Button variant="outline" onClick={() => navigate("/messages")}>
              <Mail className="h-4 w-4 mr-2" />
              Messages
            </Button>
          </div>

          <div className="grid gap-3">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="border rounded-lg p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-foreground">{assignment.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{assignment.courseId}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Due: {assignment.dueAt ? new Date(assignment.dueAt).toLocaleDateString() : "No due date"}
                  </div>
                </div>
                <Link
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  to={`/play/${assignment.courseId}/welcome?assignmentId=${assignment.id}`}
                  aria-label={`Start ${assignment.title}`}
                >
                  Start
                </Link>
              </div>
            ))}

            {assignments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No assignments yet.
              </div>
            )}
          </div>
        </div>
      </StudentLayout>
    </PageContainer>
  );
}
