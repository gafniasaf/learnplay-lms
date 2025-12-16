import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { ContinuePoint } from "@/lib/student/types";

interface ContinueCardProps {
  continuePoint: ContinuePoint | null;
}

export function ContinueCard({ continuePoint }: ContinueCardProps) {
  if (!continuePoint) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Continue Learning</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">Start a new course</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to="/courses">Browse Courses</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Continue Learning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-medium mb-1">{continuePoint.title}</h3>
          <p className="text-sm text-muted-foreground">Level {continuePoint.level}</p>
        </div>
        
        <Button className="w-full" asChild>
          <Link to={`/play/${continuePoint.courseId}/welcome?level=${continuePoint.level}`}>
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            Continue
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

