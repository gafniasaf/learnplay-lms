import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  sparkline?: number[];
  deltaVsLastWeek?: number;
  tooltip?: string;
  unit?: string;
}

export function KpiCard({ title, value, sparkline, deltaVsLastWeek, tooltip, unit }: KpiCardProps) {
  const maxSparkline = sparkline ? Math.max(...sparkline) : 1;
  const minSparkline = sparkline ? Math.min(...sparkline) : 0;
  const range = maxSparkline - minSparkline || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          {title}
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label={`Info about ${title}`}>
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm max-w-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        
        {sparkline && sparkline.length > 0 && (
          <div className="flex items-end gap-0.5 h-8" role="img" aria-label="7-day trend">
            {sparkline.map((val, idx) => {
              const heightPercent = ((val - minSparkline) / range) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 bg-primary/20 rounded-sm transition-all"
                  style={{ height: `${Math.max(heightPercent, 10)}%` }}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        )}
        
        {deltaVsLastWeek !== undefined && deltaVsLastWeek !== 0 && (
          <Badge variant={deltaVsLastWeek > 0 ? "default" : "secondary"} className="text-xs">
            {deltaVsLastWeek > 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" aria-hidden="true" />
            )}
            {deltaVsLastWeek > 0 ? '+' : ''}{deltaVsLastWeek}% vs last week
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

