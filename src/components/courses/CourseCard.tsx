import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clock, Award, Play, Info, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { CourseCatalogItem } from "@/lib/types/courseCatalog";

interface CourseCardProps {
  course: CourseCatalogItem;
  skillFocus?: string; // KO ID to focus practice on
}

export const CourseCard = ({ course, skillFocus }: CourseCardProps) => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  // Honor dev role override stored by roles system (set via ?role=admin in dev)
  const devOverrideRole = typeof window !== 'undefined' ? (localStorage.getItem('role') || null) : null;
  const isAdmin =
    role === 'admin' ||
    devOverrideRole === 'admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin';
  
  const getDifficultyColor = (difficulty?: string) => {
    if (!difficulty) {
      return "bg-primary/10 text-primary border-primary/20";
    }
    switch (difficulty.toLowerCase()) {
      case "beginner":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "intermediate":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "advanced":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <div className="group rounded-2xl border bg-card overflow-hidden hover:shadow-lg transition-all flex flex-col" data-testid="course-card">
      {/* Header with gradient */}
      <div className="aspect-video bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <BookOpen className="h-16 w-16 text-primary relative z-10" />
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-1">
        {/* Title and badges */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-xl font-semibold leading-tight">{course.title}</h3>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium border ${getDifficultyColor(
                course.difficulty
              )}`}
            >
              {course.difficulty}
            </span>
          </div>
          <p className="text-sm font-medium text-primary">{course.subject}</p>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {course.description}
        </p>

        {/* Bottom section - sticks to bottom */}
        <div className="mt-auto">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Award className="h-4 w-4" />
              <span>{course.gradeBand}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{course.duration}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>{course.itemCount} items</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs">v{course.contentVersion}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Link 
              to={skillFocus ? `/play/${course.id}/welcome?skillFocus=${skillFocus}` : `/play/${course.id}/welcome`} 
              className="flex-1"
            >
              <Button className="w-full group/btn" size="lg">
                <Play className="h-4 w-4 mr-2 group-hover/btn:scale-110 transition-transform" />
                {skillFocus ? 'Start Practice' : 'Play Course'}
              </Button>
            </Link>
            
            {isAdmin && (
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => navigate(`/admin/editor/${course.id}`)}
                title="Edit this course"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
