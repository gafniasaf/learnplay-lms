import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listStudentsForCourse, assignAssignees } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AssignStudentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  courseId: string;
}

export function AssignStudentsModal({
  open,
  onOpenChange,
  assignmentId,
  courseId,
}: AssignStudentsModalProps) {
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load students for the course
  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["students-for-course", courseId],
    queryFn: () => listStudentsForCourse(courseId),
    enabled: open && !!courseId,
  });

  // Assign students mutation
  const assignMutation = useMutation({
    mutationFn: (studentIds: string[]) =>
      assignAssignees({ assignmentId, studentIds }),
    onSuccess: () => {
      toast({
        title: "Students assigned",
        description: `Successfully assigned ${selectedStudents.length} student(s) to this assignment.`,
      });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setSelectedStudents([]);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to assign students",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleToggleAll = () => {
    if (!studentsData?.students) return;
    
    if (selectedStudents.length === studentsData.students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(studentsData.students.map((s: any) => s.student_id));
    }
  };

  const handleAssign = () => {
    if (selectedStudents.length === 0) {
      toast({
        title: "No students selected",
        description: "Please select at least one student to assign.",
        variant: "destructive",
      });
      return;
    }
    assignMutation.mutate(selectedStudents);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Students</DialogTitle>
          <DialogDescription>
            Select students to assign to this assignment
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !studentsData?.students || studentsData.students.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No students found for this course
            </div>
          ) : (
            <>
              <div className="flex items-center space-x-2 pb-2 border-b">
                <Checkbox
                  id="select-all"
                  checked={
                    studentsData.students.length > 0 &&
                    selectedStudents.length === studentsData.students.length
                  }
                  onCheckedChange={handleToggleAll}
                />
                <Label htmlFor="select-all" className="font-medium cursor-pointer">
                  Select All ({studentsData.students.length})
                </Label>
              </div>

              <div className="space-y-2">
                {studentsData.students.map((student: any) => (
                  <div
                    key={student.student_id}
                    className="flex items-center space-x-2 p-2 rounded hover:bg-muted"
                  >
                    <Checkbox
                      id={`student-${student.student_id}`}
                      checked={selectedStudents.includes(student.student_id)}
                      onCheckedChange={() => handleToggleStudent(student.student_id)}
                    />
                    <Label
                      htmlFor={`student-${student.student_id}`}
                      className="flex-1 cursor-pointer"
                    >
                      {student.student?.full_name || "Unknown Student"}
                    </Label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selectedStudents.length === 0 || assignMutation.isPending}
          >
            {assignMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Assign {selectedStudents.length > 0 && `(${selectedStudents.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
