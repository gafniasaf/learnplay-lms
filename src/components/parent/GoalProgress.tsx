import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

interface GoalProgressProps {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export function GoalProgress({ goalMinutes, actualMinutes, goalItems, actualItems }: GoalProgressProps) {
  const minutesPercent = Math.min((actualMinutes / goalMinutes) * 100, 100);
  const itemsPercent = Math.min((actualItems / goalItems) * 100, 100);
  const onTrack = actualMinutes >= goalMinutes && actualItems >= goalItems;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Weekly Goal</span>
          <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
            <Link to="/parent/goals">
              <Settings className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Edit goals
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-muted-foreground">Active Minutes</span>
            <span className="text-sm font-medium">
              {actualMinutes}/{goalMinutes} mins
            </span>
          </div>
          <Progress value={minutesPercent} className="h-2" aria-label={`${minutesPercent.toFixed(0)}% of weekly minute goal`} />
        </div>
        
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-muted-foreground">Items Completed</span>
            <span className="text-sm font-medium">
              {actualItems}/{goalItems}
            </span>
          </div>
          <Progress value={itemsPercent} className="h-2" aria-label={`${itemsPercent.toFixed(0)}% of weekly items goal`} />
        </div>
        
        <p className={`text-sm font-medium ${onTrack ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {onTrack ? '✓ On track' : `${goalMinutes - actualMinutes} mins to go`}
        </p>
      </CardContent>
    </Card>
  );
}

