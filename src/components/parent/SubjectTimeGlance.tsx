import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface SubjectTimeGlanceProps {
  bySubject: Array<{ subject: string; minutes: number }>;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export const SubjectTimeGlance = ({ bySubject }: SubjectTimeGlanceProps) => {
  const safeSubjects = Array.isArray(bySubject) ? bySubject : [];
  const topThree = safeSubjects.slice(0, 3);
  const _totalMinutes = topThree.reduce((sum, item) => sum + item.minutes, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Time by Subject</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={topThree}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={2}
                dataKey="minutes"
              >
                {topThree.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="space-y-2">
          {topThree.map((item, index) => (
            <div key={item.subject} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>{item.subject}</span>
              </div>
              <span className="text-muted-foreground">{item.minutes} min</span>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/parent/subjects">
            View details
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
