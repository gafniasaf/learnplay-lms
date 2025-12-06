import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CourseFrameProps {
  children: React.ReactNode;
}

export const CourseFrame = ({ children }: CourseFrameProps) => {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleExit = () => {
    navigate('/');
  };

  return (
    <div className="course-frame">
      <main role="main" aria-label="Course" className="course-content">
        {children}
      </main>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave course?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current round will stop and any unsaved progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
