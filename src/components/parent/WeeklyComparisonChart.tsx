import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface WeeklyData {
  minutes: number;
  items: number;
  accuracy: number;
}

interface WeeklyComparisonChartProps {
  thisWeek: WeeklyData;
  lastWeek: WeeklyData;
}

export const WeeklyComparisonChart = ({ thisWeek, lastWeek }: WeeklyComparisonChartProps) => {
  const data = [
    {
      name: 'Last Week',
      Minutes: lastWeek.minutes,
      Items: lastWeek.items,
      'Accuracy (%)': lastWeek.accuracy,
    },
    {
      name: 'This Week',
      Minutes: thisWeek.minutes,
      Items: thisWeek.items,
      'Accuracy (%)': thisWeek.accuracy,
    },
  ];

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return TrendingUp;
    if (change < 0) return TrendingDown;
    return Minus;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-success';
    if (change < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const changes = {
    minutes: getChange(thisWeek.minutes, lastWeek.minutes),
    items: getChange(thisWeek.items, lastWeek.items),
    accuracy: getChange(thisWeek.accuracy, lastWeek.accuracy),
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Week-over-Week Comparison</CardTitle>
        <p className="text-sm text-muted-foreground">Track weekly performance trends</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chart */}
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Items" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Accuracy (%)" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border bg-card text-center space-y-2">
            <p className="text-xs text-muted-foreground">Minutes</p>
            <p className="text-xl font-bold">{thisWeek.minutes}</p>
            <Badge 
              variant={changes.minutes >= 0 ? "default" : "destructive"} 
              className="gap-1 text-xs"
            >
              {(() => {
                const Icon = getTrendIcon(changes.minutes);
                return (
                  <>
                    <Icon className="h-3 w-3" />
                    {Math.abs(changes.minutes)}%
                  </>
                );
              })()}
            </Badge>
          </div>

          <div className="p-3 rounded-lg border bg-card text-center space-y-2">
            <p className="text-xs text-muted-foreground">Items</p>
            <p className="text-xl font-bold">{thisWeek.items}</p>
            <Badge 
              variant={changes.items >= 0 ? "default" : "destructive"} 
              className="gap-1 text-xs"
            >
              {(() => {
                const Icon = getTrendIcon(changes.items);
                return (
                  <>
                    <Icon className="h-3 w-3" />
                    {Math.abs(changes.items)}%
                  </>
                );
              })()}
            </Badge>
          </div>

          <div className="p-3 rounded-lg border bg-card text-center space-y-2">
            <p className="text-xs text-muted-foreground">Accuracy</p>
            <p className="text-xl font-bold">{thisWeek.accuracy}%</p>
            <Badge 
              variant={changes.accuracy >= 0 ? "default" : "destructive"} 
              className="gap-1 text-xs"
            >
              {(() => {
                const Icon = getTrendIcon(changes.accuracy);
                return (
                  <>
                    <Icon className="h-3 w-3" />
                    {Math.abs(changes.accuracy)}%
                  </>
                );
              })()}
            </Badge>
          </div>
        </div>

        {/* Summary */}
        <div className="p-3 rounded-lg bg-muted/30 border text-sm">
          <p className="font-medium mb-1">Summary</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {changes.minutes >= 0 && changes.items >= 0 
              ? "Great progress! Your child is improving across all metrics. Keep encouraging this positive momentum!"
              : changes.accuracy >= 0
              ? "Accuracy is improving! Continue focusing on quality practice to build stronger foundations."
              : "Some areas need attention. Consider reviewing challenging topics together and setting smaller, achievable goals."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
