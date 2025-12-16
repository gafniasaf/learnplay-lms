import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Award, ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { StudentAchievement } from "@/lib/student/types";

interface AchievementsGlanceProps {
  achievements: StudentAchievement[];
}

export function AchievementsGlance({ achievements }: AchievementsGlanceProps) {
  if (achievements.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Achievements</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Award className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Keep learning to earn badges!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Achievements</span>
          <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
            <Link to="/student/achievements">
              View all
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {achievements.slice(0, 3).map((achievement) => (
          <div key={achievement.id} className="flex items-center gap-3 p-2 rounded-md bg-gradient-to-r from-primary/10 to-accent/10">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Award className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{achievement.name}</p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(achievement.earnedISO), 'MMM d')}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

