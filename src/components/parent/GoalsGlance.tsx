import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";

interface GoalsGlanceProps {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export const GoalsGlance = ({ goalMinutes, actualMinutes, goalItems, actualItems }: GoalsGlanceProps) => {
  const minutesPercentage = Math.min((actualMinutes / goalMinutes) * 100, 100);
  const itemsPercentage = Math.min((actualItems / goalItems) * 100, 100);

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-success';
    if (percentage >= 70) return 'bg-warning';
    return 'bg-destructive';
  };

  const _getStatusIcon = (percentage: number) => {
    return percentage >= 80 ? '✓' : '→';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Weekly Goals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          {/* Minutes Goal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Minutes</span>
              <span className="font-medium">
                {actualMinutes} / {goalMinutes}
              </span>
            </div>
            <Progress 
              value={minutesPercentage} 
              indicatorClassName={getProgressColor(minutesPercentage)}
            />
            <div className="text-xs text-muted-foreground">
              {minutesPercentage >= 100 
                ? '🎉 Goal completed!' 
                : `${goalMinutes - actualMinutes} min remaining`
              }
            </div>
          </div>

          {/* Items Goal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Items Completed</span>
              <span className="font-medium">
                {actualItems} / {goalItems}
              </span>
            </div>
            <Progress 
              value={itemsPercentage} 
              indicatorClassName={getProgressColor(itemsPercentage)}
            />
            <div className="text-xs text-muted-foreground">
              {itemsPercentage >= 100 
                ? '🎉 Goal completed!' 
                : `${goalItems - actualItems} items remaining`
              }
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/parent/goals">
            View goals & alerts
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
