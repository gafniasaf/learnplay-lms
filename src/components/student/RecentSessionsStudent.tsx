import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import type { StudentSession } from "@/lib/student/types";

interface RecentSessionsStudentProps {
  sessions: StudentSession[];
}

export function RecentSessionsStudent({ sessions }: RecentSessionsStudentProps) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-sm text-muted-foreground">No sessions yet</p>
        </CardContent>
      </Card>
    );
  }

  const getDuration = (startISO: string, endISO: string) => {
    return differenceInMinutes(parseISO(endISO), parseISO(startISO));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.map((session, idx) => {
          const duration = getDuration(session.startISO, session.endISO);
          const startTime = format(parseISO(session.startISO), 'h:mm a');

          return (
            <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex-1">
                <div className="font-medium text-sm">{session.subject}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  <span>{startTime} • {duration} min</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{session.items} items</span>
                <Badge variant={session.accuracyPct >= 80 ? "default" : "secondary"} className="text-xs">
                  {session.accuracyPct}%
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

