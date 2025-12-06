import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, CheckCircle, Target, Flame, Info, TrendingUp, TrendingDown } from "lucide-react";

interface SummaryCardsStudentProps {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  todayItems: number;
  weekItems: number;
  monthItems: number;
  todayAccuracyPct: number;
  streakDays: number;
  minutesSparkline?: number[];
  itemsSparkline?: number[];
  minutesDeltaVsLastWeek?: number;
  itemsDeltaVsLastWeek?: number;
}

export const SummaryCardsStudent = ({ 
  todayMinutes, 
  weekMinutes, 
  monthMinutes,
  todayItems,
  weekItems,
  monthItems,
  todayAccuracyPct,
  streakDays,
  minutesSparkline,
  itemsSparkline,
  minutesDeltaVsLastWeek,
  itemsDeltaVsLastWeek
}: SummaryCardsStudentProps) => {
  const renderSparkline = (data: number[]) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    return (
      <div className="flex items-end gap-0.5 h-6 mt-2" role="img" aria-label="7-day trend">
        {data.map((val, idx) => {
          const heightPercent = ((val - min) / range) * 100;
          return (
            <div
              key={idx}
              className="flex-1 bg-primary/20 rounded-sm transition-all"
              style={{ height: `${Math.max(heightPercent, 15)}%` }}
              aria-hidden="true"
            />
          );
        })}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Active Minutes</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Info about Active Minutes">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Time you spent actively learning</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{todayMinutes}</h3>
                <span className="text-sm text-muted-foreground">today</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This week:</span>
                <span className="font-medium">{weekMinutes} min</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This month:</span>
                <span className="font-medium">{monthMinutes} min</span>
              </div>
              {minutesSparkline && minutesSparkline.length > 0 && renderSparkline(minutesSparkline)}
              {minutesDeltaVsLastWeek !== undefined && minutesDeltaVsLastWeek !== 0 && (
                <Badge variant={minutesDeltaVsLastWeek > 0 ? "default" : "secondary"} className="text-xs mt-2">
                  {minutesDeltaVsLastWeek > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {minutesDeltaVsLastWeek > 0 ? '+' : ''}{minutesDeltaVsLastWeek}%
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Items Answered</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Info about Items Answered">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Practice questions you completed</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{todayItems}</h3>
                <span className="text-sm text-muted-foreground">today</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This week:</span>
                <span className="font-medium">{weekItems} items</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This month:</span>
                <span className="font-medium">{monthItems} items</span>
              </div>
              {itemsSparkline && itemsSparkline.length > 0 && renderSparkline(itemsSparkline)}
              {itemsDeltaVsLastWeek !== undefined && itemsDeltaVsLastWeek !== 0 && (
                <Badge variant={itemsDeltaVsLastWeek > 0 ? "default" : "secondary"} className="text-xs mt-2">
                  {itemsDeltaVsLastWeek > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {itemsDeltaVsLastWeek > 0 ? '+' : ''}{itemsDeltaVsLastWeek}%
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">Accuracy</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Info about Accuracy">
                          <Info className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Your correctness percentage</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Target className="h-5 w-5 text-accent" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-3xl font-bold">{todayAccuracyPct}%</h3>
                  <Badge variant={todayAccuracyPct >= 85 ? "default" : "secondary"} className="text-xs">
                    {todayAccuracyPct >= 90 ? "Excellent" : todayAccuracyPct >= 80 ? "Good" : "Practice"}
                  </Badge>
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-warning" />
                    <span className="text-sm font-medium">Streak</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{streakDays}</span>
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow bg-gradient-to-br from-primary/5 to-accent/5">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Daily Goal</p>
              <div className="p-2 rounded-lg bg-warning/10">
                <Target className="h-5 w-5 text-warning" />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold">{todayMinutes}/20</h3>
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {todayMinutes >= 20 ? '🎉 Daily goal met!' : `${20 - todayMinutes} min to go`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

