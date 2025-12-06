import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, CheckSquare, TrendingUp, TrendingDown, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const goalsSchema = z.object({
  goalMinutes: z.number()
    .min(1, "Must be at least 1 minute")
    .max(10080, "Must be less than a week (10,080 minutes)")
    .int("Must be a whole number"),
  goalItems: z.number()
    .min(1, "Must be at least 1 item")
    .max(1000, "Must be less than 1,000 items")
    .int("Must be a whole number"),
});

interface EditableGoalsPanelProps {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
  onGoalsUpdate?: (goals: { goalMinutes: number; goalItems: number }) => void;
}

export const EditableGoalsPanel = ({ 
  goalMinutes, 
  actualMinutes, 
  goalItems, 
  actualItems,
  onGoalsUpdate 
}: EditableGoalsPanelProps) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedGoalMinutes, setEditedGoalMinutes] = useState(goalMinutes.toString());
  const [editedGoalItems, setEditedGoalItems] = useState(goalItems.toString());
  const [errors, setErrors] = useState<{ minutes?: string; items?: string }>({});

  useEffect(() => {
    if (!isEditing) {
      setEditedGoalMinutes(goalMinutes.toString());
      setEditedGoalItems(goalItems.toString());
    }
  }, [goalMinutes, goalItems, isEditing]);

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

  const handleEdit = () => {
    setIsEditing(true);
    setEditedGoalMinutes(goalMinutes.toString());
    setEditedGoalItems(goalItems.toString());
    setErrors({});
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedGoalMinutes(goalMinutes.toString());
    setEditedGoalItems(goalItems.toString());
    setErrors({});
  };

  const handleSave = () => {
    const newErrors: { minutes?: string; items?: string } = {};
    
    // Parse and validate
    const minutesNum = parseInt(editedGoalMinutes, 10);
    const itemsNum = parseInt(editedGoalItems, 10);

    if (isNaN(minutesNum)) {
      newErrors.minutes = "Please enter a valid number";
    }
    if (isNaN(itemsNum)) {
      newErrors.items = "Please enter a valid number";
    }

    // Validate with schema
    try {
      goalsSchema.parse({
        goalMinutes: minutesNum,
        goalItems: itemsNum,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => {
          if (err.path[0] === 'goalMinutes') {
            newErrors.minutes = err.message;
          } else if (err.path[0] === 'goalItems') {
            newErrors.items = err.message;
          }
        });
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Save (local only for now)
    setIsEditing(false);
    setErrors({});
    onGoalsUpdate?.({ goalMinutes: minutesNum, goalItems: itemsNum });

    toast({
      title: "Goals updated",
      description: `Weekly goals set to ${minutesNum} minutes and ${itemsNum} items.`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Weekly Goals</CardTitle>
            <p className="text-sm text-muted-foreground">Track progress toward learning targets</p>
          </div>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              aria-label="Edit goals"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                aria-label="Cancel editing"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                aria-label="Save goals"
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </div>
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
                {!isEditing ? (
                  <p className="text-xs text-muted-foreground">
                    {actualMinutes} of {goalMinutes} min
                  </p>
                ) : (
                  <div className="space-y-1 mt-1">
                    <Label htmlFor="goalMinutes" className="text-xs text-muted-foreground">
                      Goal (minutes/week)
                    </Label>
                    <Input
                      id="goalMinutes"
                      type="number"
                      value={editedGoalMinutes}
                      onChange={(e) => setEditedGoalMinutes(e.target.value)}
                      className={`h-8 w-32 ${errors.minutes ? 'border-destructive' : ''}`}
                      min="1"
                      max="10080"
                      aria-invalid={!!errors.minutes}
                      aria-describedby={errors.minutes ? "minutes-error" : undefined}
                    />
                    {errors.minutes && (
                      <p id="minutes-error" className="text-xs text-destructive" role="alert">
                        {errors.minutes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!isEditing && (
              <Badge variant={minutesStatus.variant} className="gap-1">
                <minutesStatus.icon className="h-3 w-3" />
                {minutesStatus.label}
              </Badge>
            )}
          </div>
          
          {!isEditing && (
            <div className="space-y-2">
              <Progress 
                value={minutesPercentage} 
                className="h-3"
                indicatorClassName={getProgressColor(minutesPercentage)}
                aria-label={`Minutes progress: ${minutesPercentage.toFixed(0)}%`}
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
          )}
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
                {!isEditing ? (
                  <p className="text-xs text-muted-foreground">
                    {actualItems} of {goalItems} items
                  </p>
                ) : (
                  <div className="space-y-1 mt-1">
                    <Label htmlFor="goalItems" className="text-xs text-muted-foreground">
                      Goal (items/week)
                    </Label>
                    <Input
                      id="goalItems"
                      type="number"
                      value={editedGoalItems}
                      onChange={(e) => setEditedGoalItems(e.target.value)}
                      className={`h-8 w-32 ${errors.items ? 'border-destructive' : ''}`}
                      min="1"
                      max="1000"
                      aria-invalid={!!errors.items}
                      aria-describedby={errors.items ? "items-error" : undefined}
                    />
                    {errors.items && (
                      <p id="items-error" className="text-xs text-destructive" role="alert">
                        {errors.items}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!isEditing && (
              <Badge variant={itemsStatus.variant} className="gap-1">
                <itemsStatus.icon className="h-3 w-3" />
                {itemsStatus.label}
              </Badge>
            )}
          </div>
          
          {!isEditing && (
            <div className="space-y-2">
              <Progress 
                value={itemsPercentage} 
                className="h-3"
                indicatorClassName={getProgressColor(itemsPercentage)}
                aria-label={`Items progress: ${itemsPercentage.toFixed(0)}%`}
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
          )}
        </div>

        {/* Summary Card */}
        {!isEditing && (
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
        )}
      </CardContent>
    </Card>
  );
};
