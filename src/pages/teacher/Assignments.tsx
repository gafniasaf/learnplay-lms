/**
 * TeacherAssignments - IgniteZero compliant
 * Uses edge functions via API layer instead of direct Supabase calls
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMCP } from "@/hooks/useMCP";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AssignStudentsModal } from "@/components/teacher/AssignStudentsModal";
import { Users, BarChart3 } from "lucide-react";
import { createLogger } from "@/lib/logger";

const logger = createLogger('Assignments');

export default function TeacherAssignments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const attachJobId = params.get("attachJobId") || "";
  const mcp = useMCP();
  const { data, isLoading } = useQuery({ 
    queryKey: ["teacher-assignments"], 
    queryFn: () => mcp.listAssignmentsForTeacher()
  });
  
  const m = useMutation({
    mutationFn: (params: { courseId: string; title?: string; dueAt?: string; assignees: Array<{ type: string; classId?: string; userId?: string }> }) => 
      mcp.createAssignmentForCourse(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-assignments"] });
      toast({ title: "Assignment created successfully" });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error creating assignment", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const [open, setOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<{ id: string; courseId: string } | null>(null);
  const [_orgId, _setOrgId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [_classId, _setClassId] = useState("");

  // If attachJobId present, prefill modal with job's course_id and title
  useEffect(() => {
    const loadJob = async () => {
      if (!attachJobId) return;
      try {
        const response = await mcp.getCourseJob(attachJobId);
        if (response.ok && response.job) {
        const job = response.job as { course_id?: string; subject?: string };
        if (job.course_id) {
          setCourseId(job.course_id);
            setTitle(job.subject ? `AI: ${job.subject}` : '');
            setOpen(true);
          } else {
            toast({ title: 'Unable to import job', description: 'Course not available yet', variant: 'destructive' });
          }
        }
      } catch (error) {
        logger.warn('Failed to load job', { component: 'Assignments', action: 'loadJob', error });
        toast({ title: 'Unable to import job', description: 'Job not found', variant: 'destructive' });
      }
    };
    loadJob();
  }, [attachJobId, toast, mcp]);

  const assignments = data?.assignments ?? [];

  const handleOpenAssignModal = (assignmentId: string, assignmentCourseId: string) => {
    setSelectedAssignment({ id: assignmentId, courseId: assignmentCourseId });
    setAssignModalOpen(true);
  };

  const handleImportFromAI = async () => {
    try {
      const response = await mcp.listCourseJobs({ status: 'done', limit: 1 });
      if (response.ok && response.jobs.length > 0) {
        const job = response.jobs[0] as { course_id?: string; subject?: string };
        if (job.course_id) {
          setCourseId(job.course_id);
          setTitle(job.subject ? `AI: ${job.subject}` : '');
          setOpen(true);
        } else {
          toast({ title: 'No recent AI course', description: 'Course ID not available' });
        }
      } else {
        toast({ title: 'No recent AI course', description: 'Run a generation job first' });
      }
    } catch (error) {
      logger.warn('Failed to load AI jobs', { component: 'Assignments', action: 'importFromAI', error });
      toast({ title: 'Error', description: 'Failed to load AI jobs', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Assignments</h1>
        <div className="flex items-center gap-2">
          <button 
            className="px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90" 
            onClick={() => setOpen(true)}
            data-cta-id="new-assignment"
            data-action="click"
          >
            New
          </button>
          <button
            className="px-3 py-2 border rounded hover:bg-muted"
            onClick={handleImportFromAI}
            title="Import from latest AI job"
            data-cta-id="import-from-ai"
            data-action="click"
          >
            Import from AI
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading assignments...</p>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No assignments yet</p>
          <Button onClick={() => setOpen(true)} data-cta-id="create-first-assignment" data-action="click">
            Create your first assignment
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a: any) => (
            <div key={a.id} className="p-4 border rounded-lg flex items-center justify-between hover:bg-muted/50">
              <div>
                <div className="font-medium">{a.title || a.course_id}</div>
                <div className="text-sm text-muted-foreground">
                  {a.due_at ? `Due: ${new Date(a.due_at).toLocaleDateString()}` : 'No due date'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenAssignModal(a.id, a.course_id)}
                  data-cta-id="assign-students"
                  data-action="click"
                >
                  <Users className="h-4 w-4 mr-1" />
                  Assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/teacher/analytics?assignmentId=${a.id}`)}
                  data-cta-id="view-analytics"
                  data-action="navigate"
                  data-target="/teacher/analytics"
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Analytics
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Assignment Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-xl max-w-md w-full space-y-4">
            <h2 className="text-lg font-semibold">Create Assignment</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Course ID</label>
                <input
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., algebra-basics"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Assignment title"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Due Date</label>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!courseId) {
                    toast({ title: 'Course ID required', variant: 'destructive' });
                    return;
                  }
                  // Per IgniteZero rules: No hardcoded fallbacks
                  // orgId will be derived from user's auth context by the edge function
                  m.mutate({
                    courseId: courseId,
                    title: title || courseId,
                    dueAt: due || undefined,
                    assignees: [], // Empty initially, assign via modal
                  });
                }}
                disabled={m.isPending}
                data-cta-id="confirm-create-assignment"
                data-action="click"
              >
                {m.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Students Modal */}
      {selectedAssignment && (
        <AssignStudentsModal
          open={assignModalOpen}
          onOpenChange={(open) => {
            setAssignModalOpen(open);
            if (!open) setSelectedAssignment(null);
          }}
          assignmentId={selectedAssignment.id}
          courseId={selectedAssignment.courseId}
        />
      )}
    </div>
  );
}
