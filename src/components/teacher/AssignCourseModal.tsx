import { useState, useEffect } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import type { CreateAssignmentRequest } from "@/lib/api/assignments";
import type { CourseCatalog } from "@/lib/types/courseCatalog";
import { sanitizeText } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  courseId: z.string().min(1, { message: "Please select a course" }),
  title: z.string().trim().min(1, { message: "Title is required" }).max(500),
  dueDate: z.date().optional(),
  assigneeType: z.enum(["class", "students"]),
  classId: z.string().optional(),
  studentIds: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.assigneeType === "class") {
      return !!data.classId;
    } else {
      return data.studentIds && data.studentIds.length > 0;
    }
  },
  {
    message: "Please select at least one class or student",
    path: ["assigneeType"],
  }
);

type FormValues = z.infer<typeof formSchema>;

interface AssignCourseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  orgId: string;
  classes?: Array<{ id: string; name: string }>;
  students?: Array<{ id: string; name: string }>;
}

export function AssignCourseModal({
  open,
  onClose,
  onSuccess,
  orgId,
  classes = [],
  students = [],
}: AssignCourseModalProps) {
  const mcp = useMCP();
  const [catalog, setCatalog] = useState<CourseCatalog | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      courseId: "",
      title: "",
      assigneeType: "class",
      studentIds: [],
    },
  });

  // Load course catalog
  useEffect(() => {
    if (open) {
      const loadCatalog = async () => {
        try {
          setLoadingCatalog(true);
          const data = await mcp.getCourseCatalog() as CourseCatalog;
          setCatalog(data);
        } catch (err) {
          console.error("Failed to load catalog:", err);
          toast.error("Failed to load courses");
        } finally {
          setLoadingCatalog(false);
        }
      };
      loadCatalog();
    }
  }, [open]);

  // Auto-fill title when course is selected
  const watchCourseId = form.watch("courseId");
  useEffect(() => {
    if (watchCourseId && catalog) {
      const course = catalog.courses.find((c) => c.id === watchCourseId);
      if (course && !form.getValues("title")) {
        form.setValue("title", course.title);
      }
    }
  }, [watchCourseId, catalog, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setSubmitting(true);

      // Sanitize text inputs
      const sanitizedTitle = sanitizeText(values.title, 200);

      const assignees: CreateAssignmentRequest["assignees"] = [];

      if (values.assigneeType === "class" && values.classId) {
        assignees.push({ type: "class", classId: values.classId });
      } else if (values.assigneeType === "students" && values.studentIds) {
        values.studentIds.forEach((userId) => {
          assignees.push({ type: "student", userId });
        });
      }

      await mcp.createAssignmentForCourse({
        courseId: values.courseId,
        title: sanitizedTitle,
        dueAt: values.dueDate ? values.dueDate.toISOString() : undefined,
        assignees,
      });

      toast.success("Assignment created successfully");
      form.reset();
      onClose();
      onSuccess?.();
    } catch (err) {
      console.error("Failed to create assignment:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create assignment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const assigneeType = form.watch("assigneeType");
  const selectedStudents = form.watch("studentIds") || [];

  const toggleStudent = (studentId: string) => {
    const current = form.getValues("studentIds") || [];
    if (current.includes(studentId)) {
      form.setValue(
        "studentIds",
        current.filter((id) => id !== studentId)
      );
    } else {
      form.setValue("studentIds", [...current, studentId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Course</DialogTitle>
          <DialogDescription>
            Create a new course assignment for your class or specific students
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Course Selection */}
            <FormField
              control={form.control}
              name="courseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <Select
                    disabled={loadingCatalog}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a course" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingCatalog ? (
                        <SelectItem value="loading" disabled>
                          Loading courses...
                        </SelectItem>
                      ) : catalog?.courses.length ? (
                        catalog.courses.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.title} ({course.itemCount} items)
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          No courses available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assignment Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Modal Verbs Practice" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Due Date */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Due Date (Optional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Assignee Type */}
            <FormField
              control={form.control}
              name="assigneeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="class">Entire Class</SelectItem>
                      <SelectItem value="students">Specific Students</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Class Selection */}
            {assigneeType === "class" && (
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {classes.length > 0 ? (
                          classes.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id}>
                              {cls.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            No classes available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Student Selection */}
            {assigneeType === "students" && (
              <div className="space-y-2">
                <FormLabel>Students</FormLabel>
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                  {students.length > 0 ? (
                    <div className="space-y-2">
                      {students.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={student.id}
                            checked={selectedStudents.includes(student.id)}
                            onCheckedChange={() => toggleStudent(student.id)}
                          />
                          <label
                            htmlFor={student.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {student.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No students available
                    </p>
                  )}
                </div>
                {selectedStudents.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedStudents.length} student(s) selected
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Assignment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
