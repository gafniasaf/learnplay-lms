import { Card, CardContent } from '@/components/ui/card';

interface MetricCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  detail?: string;
}

export function MetricCard({ icon, value, label, detail }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-3xl font-bold mb-1">{value}</div>
        <div className="text-sm text-muted-foreground mb-1">{label}</div>
        {detail && (
          <div className="text-xs text-muted-foreground">{detail}</div>
        )}
      </CardContent>
    </Card>
  );
}
