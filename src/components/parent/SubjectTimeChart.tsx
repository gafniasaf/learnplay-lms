import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SubjectData {
  subject: string;
  value: number;
}

interface SubjectTimeChartProps {
  bySubject: SubjectData[];
  lastWeek?: SubjectData[];
  unitLabel?: string;
}

const SUBJECT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--accent))',
  'hsl(var(--destructive))',
  'hsl(220 70% 50%)', // blue
  'hsl(280 70% 50%)', // purple
  'hsl(160 70% 50%)', // teal
];

export const SubjectTimeChart = ({ bySubject, lastWeek, unitLabel = "sessions" }: SubjectTimeChartProps) => {
  const totalValue = bySubject.reduce((sum, item) => sum + item.value, 0);

  // Calculate percentages and prepare donut data
  const chartData = bySubject.map((item, idx) => ({
    ...item,
    percentage: totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0,
    color: SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
  }));

  // Calculate week-over-week changes
  const getWeeklyChange = (subject: string, currentValue: number) => {
    if (!lastWeek) return null;
    const lastWeekData = lastWeek.find(item => item.subject === subject);
    if (!lastWeekData || lastWeekData.value === 0) return null;

    const change = ((currentValue - lastWeekData.value) / lastWeekData.value) * 100;
    return Math.round(change);
  };

  const getTrendIcon = (change: number | null) => {
    if (change === null) return Minus;
    if (change > 0) return TrendingUp;
    if (change < 0) return TrendingDown;
    return Minus;
  };

  const getTrendColor = (change: number | null) => {
    if (change === null) return 'text-muted-foreground';
    if (change > 0) return 'text-success';
    if (change < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{data.subject}</p>
          <p className="text-sm text-muted-foreground">
            {data.value} {unitLabel} ({data.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time by Subject</CardTitle>
        <p className="text-sm text-muted-foreground">This week's breakdown</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut Chart */}
          <div className="h-[280px] w-full relative">
            <span className="sr-only">
              Donut chart showing time distribution across subjects: {bySubject.map((s) => `${s.subject} ${s.value} ${unitLabel}`).join(", ")}
            </span>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="80%"
                  paddingAngle={2}
                  dataKey="value"
                  label={({ percentage }) => `${percentage}%`}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center total */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-3xl font-bold">{totalValue}</div>
                <div className="text-xs text-muted-foreground">total {unitLabel}</div>
              </div>
            </div>
          </div>

          {/* Legend with trends */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold mb-4">Subjects</h4>
            {chartData.map((item, idx) => {
              const change = getWeeklyChange(item.subject, item.value);
              const TrendIcon = getTrendIcon(change);
              const trendColor = getTrendColor(change);

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                      aria-label={`${item.subject} color indicator`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.subject}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.value} {unitLabel} · {item.percentage}%
                      </p>
                    </div>
                  </div>

                  {change !== null && (
                    <Badge variant="outline" className="ml-2 gap-1">
                      <TrendIcon className={`h-3 w-3 ${trendColor}`} />
                      <span className={trendColor}>{Math.abs(change)}%</span>
                    </Badge>
                  )}
                </div>
              );
            })}

            {lastWeek && (
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
                * Changes compared to last week
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
