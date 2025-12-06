import { Card, CardContent } from "@/components/ui/card";
import { Users, BellRing, Flame, Trophy } from "lucide-react";

interface ParentSummaryCardsProps {
  totalChildren: number;
  totalAlerts: number;
  averageStreak: number;
  totalXp: number;
}

const SummaryCard = ({
  title,
  value,
  icon: Icon,
  accent,
  helper,
}: {
  title: string;
  value: string;
  icon: typeof Users;
  accent: string;
  helper?: string;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {helper && <p className="text-xs text-muted-foreground mt-1">{helper}</p>}
        </div>
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </CardContent>
  </Card>
);

export const ParentSummaryCards = ({
  totalChildren,
  totalAlerts,
  averageStreak,
  totalXp,
}: ParentSummaryCardsProps) => {
  const formattedXp = new Intl.NumberFormat().format(totalXp);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <SummaryCard
        title="Children Linked"
        value={`${totalChildren}`}
        icon={Users}
        accent="bg-primary/10 text-primary"
        helper="Active connections"
      />
      <SummaryCard
        title="Total Alerts"
        value={`${totalAlerts}`}
        icon={BellRing}
        accent="bg-destructive/10 text-destructive"
        helper="Overdue items & goals"
      />
      <SummaryCard
        title="Average Streak"
        value={`${averageStreak} days`}
        icon={Flame}
        accent="bg-warning/10 text-warning"
        helper="Across linked children"
      />
      <SummaryCard
        title="Total XP Earned"
        value={formattedXp}
        icon={Trophy}
        accent="bg-success/10 text-success"
        helper="Cumulative progress"
      />
    </div>
  );
};
