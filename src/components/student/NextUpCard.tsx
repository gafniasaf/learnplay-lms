import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Calendar, ArrowRight } from "lucide-react";
import { format, parseISO, differenceInHours } from "date-fns";
import type { StudentAssignment } from "@/lib/student/mockSelectors";

interface NextUpCardProps {
  assignment: StudentAssignment | null;
}

export function NextUpCard({ assignment }: NextUpCardProps) {
  if (!assignment) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Next Up</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">No assignments due</p>
          <p className="text-xs text-muted-foreground mt-1">You're all caught up! 🎉</p>
        </CardContent>
      </Card>
    );
  }

  const dueDate = parseISO(assignment.dueISO);
  const hoursUntilDue = differenceInHours(dueDate, new Date());
  const isDueSoon = hoursUntilDue <= 24;
  
  return (
    <Card className={isDueSoon ? 'border-warning' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Next Up</span>
          {isDueSoon && <Badge variant="destructive" className="text-xs">Due soon</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-medium mb-1">{assignment.title}</h3>
          <Badge variant="outline" className="text-xs">{assignment.subject}</Badge>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>Due {format(dueDate, 'MMM d, h:mm a')}</span>
        </div>
        
        <Button className="w-full" asChild>
          <Link to={`/student/assignments?highlight=${assignment.id}`}>
            Start Assignment
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

