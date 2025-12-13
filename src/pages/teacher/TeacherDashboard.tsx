import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { GraduationCap, Plus, BookOpen, Users, Calendar, TrendingUp, List, BarChart3, UserCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AssignCourseModal } from "@/components/teacher/AssignCourseModal";
import { ClassFocusWidget } from "@/components/teacher/ClassFocusWidget";
import { TeacherKOTable } from "@/components/teacher/TeacherKOTable";
import { AssignmentModal } from "@/components/shared/AssignmentModal";
import type { Assignment } from "@/lib/api/assignments";
import type { Class, Student } from "@/lib/api/classes";
import { useTeacherDashboard } from "@/hooks/useTeacherDashboard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { JobProgress } from "@/components/shared/JobProgress";
import { format } from "date-fns";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";

interface AssignmentWithProgress extends Assignment {
  progress?: number;
}

const MOCK_DASHBOARD = {
  assignments: [
    {
      id: "mock-assign-1",
      course_id: "algebra-101",
      title: "Mock Algebra Assignment",
      due_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    },
    {
      id: "mock-assign-2",
      course_id: "reading-201",
      title: "Mock Reading Assignment",
      due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    },
  ] satisfies Assignment[],
  classes: [
    {
      id: "mock-class-1",
      name: "Algebra 101",
      description: "Mock class",
      owner: "teacher-1",
      org_id: "org-1",
      created_at: new Date().toISOString(),
    },
  ] satisfies Class[],
  students: [
    {
      id: "mock-student-1",
      name: "Alice Johnson",
      classIds: ["mock-class-1"],
    },
    {
      id: "mock-student-2",
      name: "Ben Lee",
      classIds: ["mock-class-1"],
    },
  ] satisfies Student[],
};

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showKOTableModal, setShowKOTableModal] = useState(false);
  const [showKOAssignmentModal, setShowKOAssignmentModal] = useState(false);
  const [selectedKOId, setSelectedKOId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const mockMode = (import.meta as any).env?.VITE_USE_MOCK === 'true';
  const mcp = useMCP();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useTeacherDashboard({ enabled: !mockMode });

  const dashboardData = useMemo(() => {
    if (mockMode) {
      return MOCK_DASHBOARD;
    }
    return {
      assignments: data?.assignments ?? [],
      classes: data?.classes ?? [],
      students: data?.students ?? [],
    };
  }, [mockMode, data]);

  const assignments: AssignmentWithProgress[] = useMemo(
    () =>
      dashboardData.assignments.map((assignment) => ({
        ...assignment,
        progress: 0,
      })),
    [dashboardData.assignments]
  );

  const classes = dashboardData.classes;
  const students = dashboardData.students;
  const activeClassId = classes[0]?.id ?? null;

  const totalAssignments = assignments.length;
  const activeAssignments = assignments.filter(
    (a) => !a.due_at || new Date(a.due_at) >= new Date()
  ).length;
  const totalClasses = classes.length;
  const _totalStudents = students.length;

  const handleAssignmentCreated = () => {
    setShowAssignModal(false);
    refetch();
    toast.success("Assignment created successfully");
  };

  const handleAssignKO = (koId: string) => {
    setSelectedKOId(koId);
    setShowKOTableModal(false);
    setShowKOAssignmentModal(true);
  };

  const handleKOAssignmentCreated = () => {
    setShowKOAssignmentModal(false);
    setSelectedKOId(null);
    toast.success("Skill assignment created successfully");
  };

  if (!mockMode && isLoading) {
    return (
      <PageContainer>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-3">
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-6 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="animate-pulse">
            <CardContent className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-muted rounded" />
              ))}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  if (!mockMode && isError) {
    const message = "Unable to load teacher dashboard.";
    return (
      <PageContainer>
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>Unable to load dashboard</AlertTitle>
          <AlertDescription>
            <p className="mb-4">{message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (!mockMode && !user) {
    return (
      <PageContainer>
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>Authentication required</AlertTitle>
          <AlertDescription>
            Please sign in to view the Teacher dashboard.
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
                Go to Login
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Teacher Dashboard</h1>
              <p className="text-muted-foreground">Manage your course assignments</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/teacher/students")} size="lg" data-cta-id="teacher-students" data-action="navigate" data-target="/teacher/students">
              <UserCheck className="h-5 w-5 mr-2" />
              Students
            </Button>
            <Button variant="outline" onClick={() => navigate("/teacher/classes")} size="lg" data-cta-id="teacher-classes" data-action="navigate" data-target="/teacher/classes">
              <Users className="h-5 w-5 mr-2" />
              Classes
            </Button>
            <Button variant="outline" onClick={() => navigate("/teacher/analytics")} size="lg" data-cta-id="teacher-analytics" data-action="navigate" data-target="/teacher/analytics">
              <BarChart3 className="h-5 w-5 mr-2" />
              Analytics
            </Button>
            <Button variant="outline" onClick={() => navigate("/messages")} size="lg" data-cta-id="teacher-messages" data-action="navigate" data-target="/messages">
              <Mail className="h-5 w-5 mr-2" />
              Messages
            </Button>
            <Button variant="outline" onClick={() => navigate("/teacher/assignments")} size="lg" data-cta-id="teacher-assignments" data-action="navigate" data-target="/teacher/assignments">
              <List className="h-5 w-5 mr-2" />
              All Assignments
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={async () => {
                const topic = prompt("Generate assignment for topic:");
                if (!topic) return;
                try {
                  const json = await mcp.call<any>('lms.generateAssignment', { topic });
                  if (json.jobId) {
                    toast.success(`Generating assignment… Job: ${json.jobId}`);
                    setActiveJobId(json.jobId);
                  } else {
                    toast.error(json?.error?.message || "Failed to start assignment generation");
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to start assignment generation");
                }
              }}
            >
              ✨ Generate Assignment
            </Button>
            <Button onClick={() => setShowAssignModal(true)} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Assign Course
            </Button>
            {activeJobId && (
              <div className="flex items-center gap-2 ml-2">
                <JobProgress jobId={activeJobId} />
                <Button variant="link" size="sm" onClick={() => navigate(`/admin/jobs?jobId=${activeJobId}`)}>
                  View job
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Class Focus (Knowledge Map) */}
        <div className="mb-8">
          {activeClassId ? (
            <ClassFocusWidget
              classId={activeClassId}
              onCreateAssignment={handleAssignKO}
              onViewAll={() => setShowKOTableModal(true)}
            />
          ) : (
            <Alert className="border-warning bg-warning/10">
              <AlertTitle>Class required</AlertTitle>
              <AlertDescription>
                Create a class to view the Knowledge Map and assign skill practice.
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => navigate("/teacher/classes")}>
                    Go to Classes
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Remediation CTA */}
          <div className="mt-4 p-4 border rounded-lg bg-primary/5 flex items-center justify-between">
            <div>
              <p className="font-medium">Personalized remediation</p>
              <p className="text-sm text-muted-foreground">
                Generate a quick practice set for a struggling skill.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const ko = prompt("Enter skill/KO id or subject");
                  if (!ko) return;
                  const json = await mcp.call<any>('lms.generateRemediation', { subject: ko, itemsPerGroup: 8 });
                  if (json.jobId) {
                    toast.success(`Generating remediation set… Job: ${json.jobId}`);
                    setActiveJobId(json.jobId);
                  } else {
                    toast.error(json?.error?.message || "Failed to start remediation");
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to start remediation");
                }
              }}
            >
              Get Practice Set
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assignments</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAssignments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeAssignments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Classes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClasses}</div>
              <p className="text-xs text-muted-foreground">Active classes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {assignments.length > 0
                  ? Math.round(
                      assignments.reduce((sum, a) => sum + (a.progress || 0), 0) /
                        assignments.length
                    )
                  : 0}
                %
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assignments List */}
        <div>
          <h2 className="text-2xl font-bold mb-6">Your Assignments</h2>

          {assignments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No assignments yet. Create one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <Card key={assignment.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">
                          {assignment.title || "Untitled assignment"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {assignment.course_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.due_at
                            ? `Due ${format(new Date(assignment.due_at), "MMM d, yyyy")}`
                            : "No due date"}
                        </p>
                      </div>
                      <div className="space-y-2 w-40">
                        <Progress value={assignment.progress ?? 0} className="h-2" />
                        <p className="text-xs text-muted-foreground text-right">
                          {assignment.progress ?? 0}% complete
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <AssignCourseModal
          open={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          onSuccess={handleAssignmentCreated}
          classes={classes}
          students={students}
        />

        {/* Knowledge Map Modals */}
        {activeClassId && (
          <TeacherKOTable
            isOpen={showKOTableModal}
            onClose={() => setShowKOTableModal(false)}
            classId={activeClassId}
            onAssignKO={handleAssignKO}
          />
        )}

        {showKOAssignmentModal && selectedKOId && activeClassId && user?.id && (
          <AssignmentModal
            isOpen={showKOAssignmentModal}
            onClose={() => {
              setShowKOAssignmentModal(false);
              setSelectedKOId(null);
            }}
            koId={selectedKOId}
            assignerId={user.id}
            assignerRole="teacher"
            contextId={activeClassId}
            onCreateAssignment={handleKOAssignmentCreated}
          />
        )}
      </div>
    </PageContainer>
  );
};

export default TeacherDashboard;
