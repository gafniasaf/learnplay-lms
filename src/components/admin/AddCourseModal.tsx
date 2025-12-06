import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { sanitizeText } from "@/lib/sanitize";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (course: NewCourse) => void;
}

export interface NewCourse {
  id: string;
  title: string;
  description: string;
  level: string;
  duration: string;
}

export const AddCourseModal = ({ open, onClose, onAdd }: AddCourseModalProps) => {
  const [formData, setFormData] = useState<NewCourse>({
    id: "",
    title: "",
    description: "",
    level: "Beginner",
    duration: "30 min",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error("Please enter a course title");
      return;
    }

    // Sanitize inputs before submission
    const sanitizedData: NewCourse = {
      id: sanitizeText(formData.id, 64),
      title: sanitizeText(formData.title, 120),
      description: sanitizeText(formData.description, 500),
      level: sanitizeText(formData.level, 50),
      duration: sanitizeText(formData.duration, 50),
    };

    // Generate ID from title if not provided
    const courseId = sanitizedData.id || sanitizedData.title.toLowerCase().replace(/\s+/g, "-");
    
    onAdd({ ...sanitizedData, id: courseId });
    
    // Reset form
    setFormData({
      id: "",
      title: "",
      description: "",
      level: "Beginner",
      duration: "30 min",
    });
    
    toast.success("Course added successfully!");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Course</DialogTitle>
          <DialogDescription>
            Create a new course entry (mock only - saved in memory)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Course Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Advanced Mathematics"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="id">Course ID (optional)</Label>
            <Input
              id="id"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              placeholder="e.g., math-advanced"
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from title if left empty
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief course description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <select
                id="level"
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                className="w-full px-3 py-2 rounded-md border bg-background"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>All Levels</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="e.g., 30 min"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add Course</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
