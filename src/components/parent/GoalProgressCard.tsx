import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Star, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface GoalProgressCardProps {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export const GoalProgressCard = ({
  goalMinutes,
  actualMinutes,
  goalItems,
  actualItems,
}: GoalProgressCardProps) => {
  const navigate = useNavigate();
  const minutesPercentage = Math.round((actualMinutes / goalMinutes) * 100);
  const itemsPercentage = Math.round((actualItems / goalItems) * 100);
  const overallPercentage = Math.round((minutesPercentage + itemsPercentage) / 2);

  const getMessage = () => {
    if (overallPercentage >= 90) return { text: "Excellent progress! Keep up the great work!", icon: Star, color: "text-amber-500" };
    if (overallPercentage >= 70) return { text: "Good momentum! You're on track for the week.", icon: TrendingUp, color: "text-blue-500" };
    if (overallPercentage >= 50) return { text: "Making progress—encourage more practice this week.", icon: Flame, color: "text-orange-500" };
    return { text: "Let's work together to catch up on weekly goals.", icon: Target, color: "text-muted-foreground" };
  };

  const getProgressColor = () => {
    if (overallPercentage >= 90) return "bg-gradient-to-r from-green-500 to-emerald-600";
    if (overallPercentage >= 70) return "bg-gradient-to-r from-blue-500 to-indigo-600";
    if (overallPercentage >= 50) return "bg-gradient-to-r from-amber-500 to-orange-600";
    return "bg-gradient-to-r from-red-500 to-rose-600";
  };

  const message = getMessage();
  const MessageIcon = message.icon;

  // Circular progress calculation
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallPercentage / 100) * circumference;

  return (
    <Card className="relative overflow-hidden p-6 border border-border/40 bg-card hover:shadow-md transition-all duration-200">
      <div className="space-y-5">
        {/* Header with refined circular progress */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Weekly Goals</h3>
            </div>
            <p className="text-xs text-muted-foreground">Track your child's progress</p>
          </div>
          
          {/* Refined circular progress */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <svg width="90" height="90" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="45"
                cy="45"
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="6"
                opacity="0.15"
              />
              {/* Progress circle */}
              <circle
                cx="45"
                cy="45"
                r={radius}
                fill="none"
                stroke={overallPercentage >= 90 ? "hsl(142, 76%, 36%)" : overallPercentage >= 70 ? "hsl(221, 83%, 53%)" : overallPercentage >= 50 ? "hsl(32, 95%, 44%)" : "hsl(0, 84%, 60%)"}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{overallPercentage}%</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">done</span>
            </div>
          </div>
        </div>

        {/* Refined progress bars */}
        <div className="space-y-3">
          {/* Minutes progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium">Active Minutes</span>
              <span className="text-muted-foreground tabular-nums">
                {actualMinutes} / {goalMinutes}
              </span>
            </div>
            <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{ 
                  width: `${Math.min(minutesPercentage, 100)}%`,
                  backgroundColor: overallPercentage >= 90 ? "hsl(142, 76%, 36%)" : overallPercentage >= 70 ? "hsl(221, 83%, 53%)" : overallPercentage >= 50 ? "hsl(32, 95%, 44%)" : "hsl(0, 84%, 60%)"
                }}
              />
            </div>
          </div>

          {/* Items progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium">Items Completed</span>
              <span className="text-muted-foreground tabular-nums">
                {actualItems} / {goalItems}
              </span>
            </div>
            <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{ 
                  width: `${Math.min(itemsPercentage, 100)}%`,
                  backgroundColor: overallPercentage >= 90 ? "hsl(142, 76%, 36%)" : overallPercentage >= 70 ? "hsl(221, 83%, 53%)" : overallPercentage >= 50 ? "hsl(32, 95%, 44%)" : "hsl(0, 84%, 60%)"
                }}
              />
            </div>
          </div>
        </div>

        {/* Encouragement message */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
          <MessageIcon className={cn("h-4 w-4 flex-shrink-0 mt-0.5", message.color)} />
          <p className="text-xs leading-relaxed text-muted-foreground">{message.text}</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate("/parent/goals")}
        >
          Edit Weekly Goals
        </Button>
      </div>
    </Card>
  );
};
