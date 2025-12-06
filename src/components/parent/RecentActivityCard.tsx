import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Target, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SessionActivity {
  startISO: string;
  endISO: string;
  subject: string;
  level: string;
  items: number;
  accuracyPct: number;
  mastered: boolean;
  mistakes: number;
}

interface RecentActivityCardProps {
  sessions: SessionActivity[];
}

export const RecentActivityCard = ({ sessions }: RecentActivityCardProps) => {
  const navigate = useNavigate();
  const recent = sessions.slice(0, 2);

  const getDuration = (session: SessionActivity) => {
    const start = new Date(session.startISO);
    const end = new Date(session.endISO);
    return Math.round((end.getTime() - start.getTime()) / 60000);
  };

  if (sessions.length === 0) {
    return (
      <Card className="p-6 border border-border/40 bg-card">
        <div className="space-y-4 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <div>
            <h3 className="font-semibold mb-1">Recent Activity</h3>
            <p className="text-sm text-muted-foreground">No recent activity to display.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate("/parent/timeline")}
          >
            View Timeline
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border border-border/40 bg-card hover:shadow-md transition-all duration-200">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Recent Activity</h3>
          <p className="text-xs text-muted-foreground">Latest learning sessions</p>
        </div>

        <div className="space-y-2.5">
          {recent.map((session, idx) => (
            <div
              key={idx}
              className="group p-3.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors duration-200 border border-border/40"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{session.subject}</span>
                  {session.mastered && (
                    <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                      Mastered
                    </Badge>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{format(new Date(session.startISO), "h:mm a")}</span>
                    <span>·</span>
                    <span>{getDuration(session)} min</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    <span>{session.items} items</span>
                  </div>
                  
                  <div className="flex items-center gap-1 font-medium">
                    <TrendingUp className="h-3 w-3" />
                    <span>{session.accuracyPct}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate("/parent/timeline")}
        >
          View Timeline
        </Button>
      </div>
    </Card>
  );
};
