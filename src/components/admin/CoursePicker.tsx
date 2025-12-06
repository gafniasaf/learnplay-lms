import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCourseCatalog } from "@/lib/api";
import { toast } from "sonner";

interface CoursePickerProps {
  onSelect: (courseId: string) => void;
}

export const CoursePicker = ({ onSelect }: CoursePickerProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    if (open && courses.length === 0) {
      loadCourses();
    }
  }, [open]);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const catalog = await getCourseCatalog();
      setCourses(catalog.courses.map(c => ({ id: c.id, title: c.title })));
    } catch (err) {
      console.error('Failed to load courses:', err);
      toast.error('Failed to load course catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromCatalog = (courseId: string) => {
    setOpen(false);
    onSelect(courseId);
  };

  const handleSelectManual = () => {
    if (!manualId.trim()) {
      toast.error('Please enter a course ID');
      return;
    }
    onSelect(manualId.trim());
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Select from catalog</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Search className="h-4 w-4 mr-2" />
              Browse courses...
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search courses..." />
              <CommandEmpty>
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  'No courses found.'
                )}
              </CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-y-auto">
                {courses.map((course) => (
                  <CommandItem
                    key={course.id}
                    onSelect={() => handleSelectFromCatalog(course.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{course.title}</span>
                      <span className="text-sm text-muted-foreground">{course.id}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Enter course ID manually</Label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g., modals"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSelectManual();
            }}
          />
          <Button onClick={handleSelectManual}>Load</Button>
        </div>
      </div>
    </div>
  );
};
