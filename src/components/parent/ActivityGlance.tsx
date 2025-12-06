import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO, differenceInMinutes } from "date-fns";
import type { SessionActivity } from "./ActivityTimeline";

interface ActivityGlanceProps {
  sessions: SessionActivity[];
}

export const ActivityGlance = ({ sessions }: ActivityGlanceProps) => {
  const getDuration = (startISO: string | undefined, endISO: string | undefined) => {
    if (!startISO) {
      return 0;
    }

    const start = parseISO(startISO);
    const end = endISO ? parseISO(endISO) : start;
    return Math.max(0, differenceInMinutes(end, start));
  };

  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const recent = safeSessions.slice(0, 5).map((session) => ({
    ...session,
    durationMinutes: getDuration(session.startISO, session.endISO),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {recent.map((session, index) => {
            const duration = session.durationMinutes;
            const startTime = session.startISO ? format(parseISO(session.startISO), 'h:mm a') : 'Unknown time';

            return (
              <div key={index} className="space-y-2 pb-3 border-b last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{session.subject}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{startTime} • {duration} min</span>
                    </div>
                  </div>
                  {session.mastered && (
                    <Badge variant="default" className="text-xs">
                      Mastered
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{session.items} items</span>
                  <span className={session.accuracyPct >= 80 ? 'text-success font-medium' : 'text-warning font-medium'}>
                    {session.accuracyPct}%
                  </span>
                  {session.mistakes > 0 && (
                    <span className="text-warning">{session.mistakes} mistakes</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/parent/timeline">
            View timeline
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
