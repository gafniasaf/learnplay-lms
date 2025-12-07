import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// cn import removed - not used

interface SubjectData {
  subject: string;
  minutes: number;
  change?: number;
}

interface SubjectTimeCardProps {
  subjects: SubjectData[];
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))"];

export const SubjectTimeCard = ({ subjects }: SubjectTimeCardProps) => {
  const navigate = useNavigate();
  const total = subjects.reduce((sum, s) => sum + s.minutes, 0);
  const top3 = subjects.slice(0, 3);

  const chartData = subjects.map((s) => ({
    name: s.subject,
    value: s.minutes,
  }));

  return (
    <Card className="relative overflow-hidden p-6 border border-border/40 bg-card hover:shadow-md transition-all duration-200">
      <div className="space-y-5">
        <div>
          <h3 className="font-semibold mb-1">Time by Subject</h3>
          <p className="text-xs text-muted-foreground">This week's learning distribution</p>
        </div>

        <div className="flex items-center gap-6">
          {/* Refined donut chart */}
          <div className="relative w-24 h-24 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={26}
                  outerRadius={44}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold">{total}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">min</span>
            </div>
          </div>

          {/* Refined subject list */}
          <div className="flex-1 space-y-3">
            {top3.map((subject, idx) => {
              const percentage = Math.round((subject.minutes / total) * 100);
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="font-medium">{subject.subject}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{subject.minutes} min</span>
                      {subject.change !== undefined && subject.change !== 0 && (
                        <div className="flex items-center gap-0.5 text-xs">
                          {subject.change > 0 ? (
                            <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Refined progress bar */}
                  <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: COLORS[idx % COLORS.length]
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate("/parent/subjects")}
        >
          View Details
        </Button>
      </div>
    </Card>
  );
};
