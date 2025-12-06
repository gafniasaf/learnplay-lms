import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

interface WeeklyGoalRingProps {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export function WeeklyGoalRing({ goalMinutes, actualMinutes, goalItems, actualItems }: WeeklyGoalRingProps) {
  const minutesPercent = Math.min((actualMinutes / goalMinutes) * 100, 100);
  const itemsPercent = Math.min((actualItems / goalItems) * 100, 100);
  const overallPercent = (minutesPercent + itemsPercent) / 2;
  const onTrack = overallPercent >= 80;
  
  // SVG circle parameters
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallPercent / 100) * circumference;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Weekly Goal</span>
          <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
            <Link to="/student/goals">
              <Settings className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              View
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="relative flex items-center justify-center">
          <svg width="140" height="140" className="transform -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={onTrack ? "hsl(var(--success))" : "hsl(var(--warning))"}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500"
              role="img"
              aria-label={`Weekly goal ${Math.round(overallPercent)}% complete`}
              aria-valuenow={Math.round(overallPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-bold">{Math.round(overallPercent)}%</span>
            <span className="text-xs text-muted-foreground">complete</span>
          </div>
        </div>
        
        <div className="w-full space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Minutes:</span>
            <span className="font-medium">{actualMinutes}/{goalMinutes}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Items:</span>
            <span className="font-medium">{actualItems}/{goalItems}</span>
          </div>
        </div>
        
        <p className={`text-sm font-medium ${onTrack ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {onTrack ? '✓ On track!' : `${Math.max(goalMinutes - actualMinutes, 0)} min to go`}
        </p>
      </CardContent>
    </Card>
  );
}

