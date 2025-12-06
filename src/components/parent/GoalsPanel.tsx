import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckSquare, TrendingUp, TrendingDown } from "lucide-react";

interface GoalsPanelProps {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export const GoalsPanel = ({ goalMinutes, actualMinutes, goalItems, actualItems }: GoalsPanelProps) => {
  const getProgressPercentage = (actual: number, goal: number) => {
    if (goal === 0) return 0;
    return Math.min((actual / goal) * 100, 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-success';
    if (percentage >= 75) return 'bg-success';
    if (percentage >= 50) return 'bg-warning';
    return 'bg-destructive';
  };

  const getStatusBadge = (actual: number, goal: number) => {
    const percentage = getProgressPercentage(actual, goal);
    
    if (percentage >= 100) {
      return { variant: 'default' as const, label: 'Goal Met!', icon: TrendingUp, color: 'text-success' };
    }
    if (percentage >= 75) {
      return { variant: 'default' as const, label: 'On Track', icon: TrendingUp, color: 'text-success' };
    }
    if (percentage >= 50) {
      return { variant: 'secondary' as const, label: 'Keep Going', icon: TrendingUp, color: 'text-warning' };
    }
    return { variant: 'destructive' as const, label: 'Needs Attention', icon: TrendingDown, color: 'text-destructive' };
  };

  const minutesPercentage = getProgressPercentage(actualMinutes, goalMinutes);
  const itemsPercentage = getProgressPercentage(actualItems, goalItems);
  
  const minutesStatus = getStatusBadge(actualMinutes, goalMinutes);
  const itemsStatus = getStatusBadge(actualItems, goalItems);

  const remaining = {
    minutes: Math.max(0, goalMinutes - actualMinutes),
    items: Math.max(0, goalItems - actualItems),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Goals</CardTitle>
        <p className="text-sm text-muted-foreground">Track progress toward learning targets</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Minutes Goal */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Active Minutes</p>
                <p className="text-xs text-muted-foreground">
                  {actualMinutes} of {goalMinutes} min
                </p>
              </div>
            </div>
            <Badge variant={minutesStatus.variant} className="gap-1">
              <minutesStatus.icon className="h-3 w-3" />
              {minutesStatus.label}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={minutesPercentage} 
              className="h-3"
              indicatorClassName={getProgressColor(minutesPercentage)}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {minutesPercentage.toFixed(0)}% complete
              </span>
              {remaining.minutes > 0 && (
                <span className={minutesStatus.color}>
                  {remaining.minutes} min to go
                </span>
              )}
              {remaining.minutes === 0 && (
                <span className="text-success font-medium">
                  ✓ Goal achieved!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Items Goal */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckSquare className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="font-semibold">Items Completed</p>
                <p className="text-xs text-muted-foreground">
                  {actualItems} of {goalItems} items
                </p>
              </div>
            </div>
            <Badge variant={itemsStatus.variant} className="gap-1">
              <itemsStatus.icon className="h-3 w-3" />
              {itemsStatus.label}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={itemsPercentage} 
              className="h-3"
              indicatorClassName={getProgressColor(itemsPercentage)}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {itemsPercentage.toFixed(0)}% complete
              </span>
              {remaining.items > 0 && (
                <span className={itemsStatus.color}>
                  {remaining.items} items to go
                </span>
              )}
              {remaining.items === 0 && (
                <span className="text-success font-medium">
                  ✓ Goal achieved!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="p-4 rounded-lg bg-muted/30 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly Progress</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {Math.round((minutesPercentage + itemsPercentage) / 2)}% overall
              </p>
            </div>
            {minutesPercentage >= 100 && itemsPercentage >= 100 ? (
              <Badge variant="default" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                Both Goals Met! 🎉
              </Badge>
            ) : minutesPercentage >= 75 && itemsPercentage >= 75 ? (
              <Badge variant="default" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                Great Progress!
              </Badge>
            ) : (
              <Badge variant="outline">
                Keep It Up!
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
