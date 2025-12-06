import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Target, AlertTriangle, Frown, CheckCircle2, Bell } from "lucide-react";

export interface Alert {
  id: string;
  type: 'streak' | 'accuracy' | 'inactivity' | 'frustration';
  message: string;
  ctaLabel?: string;
}

interface AlertsPanelProps {
  alerts: Alert[];
}

export const AlertsPanel = ({ alerts }: AlertsPanelProps) => {
  const getAlertConfig = (type: Alert['type']) => {
    switch (type) {
      case 'streak':
        return {
          icon: Flame,
          iconColor: 'text-warning',
          bgColor: 'bg-warning/5',
          borderColor: 'border-warning/20',
          badge: 'Streak',
          badgeVariant: 'default' as const,
        };
      case 'accuracy':
        return {
          icon: Target,
          iconColor: 'text-success',
          bgColor: 'bg-success/5',
          borderColor: 'border-success/20',
          badge: 'Accuracy',
          badgeVariant: 'default' as const,
        };
      case 'inactivity':
        return {
          icon: AlertTriangle,
          iconColor: 'text-destructive',
          bgColor: 'bg-destructive/5',
          borderColor: 'border-destructive/20',
          badge: 'Inactivity',
          badgeVariant: 'destructive' as const,
        };
      case 'frustration':
        return {
          icon: Frown,
          iconColor: 'text-warning',
          bgColor: 'bg-warning/5',
          borderColor: 'border-warning/20',
          badge: 'Support Needed',
          badgeVariant: 'secondary' as const,
        };
    }
  };

  const handleAlertAction = (alert: Alert) => {
    console.log('Alert action clicked:', alert.id, alert.type);
    // Future: integrate with backend or navigation
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alerts & Nudges
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Personalized insights and recommendations
            </p>
          </div>
          {alerts.length > 0 && (
            <Badge variant="secondary">{alerts.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <CheckCircle2 className="h-16 w-16 text-success mx-auto opacity-50" />
              <div>
                <p className="font-medium">All Caught Up!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No alerts at this time. Keep up the great work!
                </p>
              </div>
            </div>
          ) : (
            alerts.map((alert) => {
              const config = getAlertConfig(alert.type);
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${config.bgColor} ${config.borderColor} space-y-3 hover:shadow-sm transition-shadow`}
                  role="article"
                  aria-label={`${config.badge} alert: ${alert.message}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 p-2 rounded-lg ${config.bgColor}`}>
                      <Icon className={`h-5 w-5 ${config.iconColor}`} aria-hidden="true" />
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-relaxed flex-1">
                          {alert.message}
                        </p>
                        <Badge 
                          variant={config.badgeVariant} 
                          className="text-xs whitespace-nowrap flex-shrink-0"
                        >
                          {config.badge}
                        </Badge>
                      </div>

                      {alert.ctaLabel && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAlertAction(alert)}
                          className="w-full mt-2"
                          aria-label={`${alert.ctaLabel} for ${config.badge.toLowerCase()} alert`}
                        >
                          {alert.ctaLabel}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {alerts.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Actions are suggestions to help support your child's learning journey
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
