import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAssignmentsForTeacher, createAssignment, type CreateAssignmentRequest } from "@/lib/api";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AssignStudentsModal } from "@/components/teacher/AssignStudentsModal";
import { Users, BarChart3 } from "lucide-react";

export default function TeacherAssignments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const attachJobId = params.get("attachJobId") || "";
  const { data, isLoading } = useQuery({ 
    queryKey: ["teacher-assignments"], 
    queryFn: listAssignmentsForTeacher 
  });
  
  const m = useMutation({
    mutationFn: createAssignment,
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
  const [orgId, setOrgId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [classId, setClassId] = useState("");

  // Load user org on mount
  useState(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: orgUser } = await supabase
          .from("organization_users")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (orgUser) setOrgId(orgUser.org_id);
      }
    })();
  });

  // If attachJobId present, prefill modal with job's course_id and title
  useState(() => {
    (async () => {
      if (!attachJobId) return;
      const { data: job } = await supabase
        .from('ai_course_jobs')
        .select('course_id, subject, status, created_by')
        .eq('id', attachJobId)
        .maybeSingle();
      if (job?.course_id) {
        setCourseId(job.course_id);
        setTitle(job.subject ? `AI: ${job.subject}` : '');
        setOpen(true);
      } else {
        toast({ title: 'Unable to import job', description: 'Course not available yet', variant: 'destructive' });
      }
    })();
  });

  const assignments = data?.assignments ?? [];

  const handleOpenAssignModal = (assignmentId: string, assignmentCourseId: string) => {
    setSelectedAssignment({ id: assignmentId, courseId: assignmentCourseId });
    setAssignModalOpen(true);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Assignments</h1>
        <div className="flex items-center gap-2">
          <button 
            className="px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90" 
            onClick={() => setOpen(true)}
          >
            New
          </button>
          <button
            className="px-3 py-2 border rounded hover:bg-muted"
            onClick={async () => {
              const { data: jobs } = await supabase
                .from('ai_course_jobs')
                .select('id, course_id, subject, status, created_at')
                .eq('status', 'done')
                .order('created_at', { ascending: false })
                .limit(1);
              const j = jobs?.[0];
              if (j?.course_id) {
                setCourseId(j.course_id);
                setTitle(j.subject ? `AI: ${j.subject}` : '');
                setOpen(true);
              } else {
                toast({ title: 'No recent AI course', description: 'Run a generation job first' });
              }
            }}
            title="Import from latest AI job"
          >
            Import from AI
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            Loading assignments...
          </div>
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Title</th>
              <th className="text-left p-2">Course</th>
              <th className="text-left p-2">Due</th>
              <th className="text-center p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b hover:bg-muted/50">
                <td className="p-2">{a.title || "Untitled"}</td>
                <td className="p-2">{a.course_id}</td>
                <td className="p-2">{a.due_at ? new Date(a.due_at).toLocaleDateString() : "—"}</td>
                <td className="p-2">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAssignModal(a.id, a.course_id)}
                      title="Assign students"
                    >
                      <Users className="h-4 w-4 mr-1" />
                      Assign
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/teacher/assignments/${a.id}/progress`)}
                      title="View progress"
                    >
                      <BarChart3 className="h-4 w-4 mr-1" />
                      Progress
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  No assignments yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Assign Students Modal */}
      {selectedAssignment && (
        <AssignStudentsModal
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          assignmentId={selectedAssignment.id}
          courseId={selectedAssignment.courseId}
        />
      )}

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-background rounded-lg p-4 w-[420px] shadow-lg border">
            <h2 className="text-lg font-semibold mb-3">New Assignment</h2>
            
            <label className="block text-sm mb-2">
              Course ID
              <input 
                className="w-full border rounded p-2 mt-1 bg-background" 
                value={courseId} 
                onChange={e => setCourseId(e.target.value)} 
                placeholder="e.g. modals" 
              />
            </label>
            
            <label className="block text-sm mb-2">
              Class ID
              <input 
                className="w-full border rounded p-2 mt-1 bg-background" 
                value={classId} 
                onChange={e => setClassId(e.target.value)} 
                placeholder="UUID of class" 
              />
            </label>
            
            <label className="block text-sm mb-2">
              Title (optional)
              <input 
                className="w-full border rounded p-2 mt-1 bg-background" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder="Assignment title"
              />
            </label>
            
            <label className="block text-sm mb-3">
              Due date (optional)
              <input 
                className="w-full border rounded p-2 mt-1 bg-background" 
                type="datetime-local" 
                onChange={e => setDue(e.target.value ? new Date(e.target.value).toISOString() : "")} 
              />
            </label>
            
            <div className="flex justify-end gap-2">
              <button 
                className="px-3 py-2 hover:bg-muted rounded" 
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                onClick={() => {
                  if (!orgId || !courseId || !classId) {
                    toast({ title: "Missing required fields", variant: "destructive" });
                    return;
                  }
                  const req: CreateAssignmentRequest = {
                    orgId,
                    courseId,
                    title: title || undefined,
                    dueAt: due || undefined,
                    assignees: [{ type: "class", classId }]
                  };
                  m.mutate(req);
                }}
                disabled={m.isPending}
              >
                {m.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
