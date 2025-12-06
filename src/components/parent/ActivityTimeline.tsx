import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";

export interface SessionActivity {
  startISO: string;
  endISO: string;
  subject: string;
  level: string;
  items: number;
  accuracyPct: number;
  mastered: boolean;
  mistakes: number;
}

interface ActivityTimelineProps {
  sessions: SessionActivity[];
  onSessionClick?: (session: SessionActivity) => void;
}

type FilterType = 'all' | 'mistakes' | 'mastered';

export const ActivityTimeline = ({ sessions, onSessionClick }: ActivityTimelineProps) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Filter sessions
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    switch (activeFilter) {
      case 'mistakes':
        result = result.filter(s => s.mistakes > 0);
        break;
      case 'mastered':
        result = result.filter(s => s.mastered);
        break;
      default:
        break;
    }

    // Sort by start time descending (most recent first)
    return result.sort((a, b) => 
      new Date(b.startISO).getTime() - new Date(a.startISO).getTime()
    );
  }, [sessions, activeFilter]);

  const getSessionDuration = (startISO: string, endISO: string) => {
    const start = parseISO(startISO);
    const end = parseISO(endISO);
    return differenceInMinutes(end, start);
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return 'text-success';
    if (accuracy >= 80) return 'text-warning';
    return 'text-destructive';
  };

  const getSessionIcon = (session: SessionActivity) => {
    if (session.mastered) return CheckCircle2;
    if (session.mistakes > 0) return AlertCircle;
    return TrendingUp;
  };

  const getIconColor = (session: SessionActivity) => {
    if (session.mastered) return 'text-success bg-success/10';
    if (session.mistakes > 0) return 'text-warning bg-warning/10';
    return 'text-primary bg-primary/10';
  };

  const filters: { value: FilterType; label: string; count: number }[] = [
    { 
      value: 'all', 
      label: 'All', 
      count: sessions.length 
    },
    { 
      value: 'mistakes', 
      label: 'Mistakes Only', 
      count: sessions.filter(s => s.mistakes > 0).length 
    },
    { 
      value: 'mastered', 
      label: 'Mastered Only', 
      count: sessions.filter(s => s.mastered).length 
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Activity</CardTitle>
        <p className="text-sm text-muted-foreground">Learning session timeline</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Activity filters">
          {filters.map(filter => (
            <Badge
              key={filter.value}
              variant={activeFilter === filter.value ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1.5 text-xs"
              onClick={() => setActiveFilter(filter.value)}
              role="tab"
              aria-selected={activeFilter === filter.value}
              aria-label={`${filter.label}: ${filter.count} sessions`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveFilter(filter.value);
                }
              }}
            >
              {filter.label} ({filter.count})
            </Badge>
          ))}
        </div>

        {/* Timeline */}
        <div className="space-y-4 pt-2">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">
                {activeFilter === 'all' 
                  ? "No activity yet today"
                  : `No ${activeFilter === 'mistakes' ? 'mistakes' : 'mastered'} sessions today`
                }
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div 
                className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border"
                aria-hidden="true"
              />

              {/* Sessions */}
              <div className="space-y-4" role="list" aria-label="Learning sessions">
                {filteredSessions.map((session, idx) => {
                  const Icon = getSessionIcon(session);
                  const iconColor = getIconColor(session);
                  const duration = getSessionDuration(session.startISO, session.endISO);
                  const startTime = format(parseISO(session.startISO), 'h:mm a');
                  const endTime = format(parseISO(session.endISO), 'h:mm a');

                  return (
                    <div
                      key={idx}
                      className="relative flex gap-4 pl-1 cursor-pointer hover:bg-accent/10 p-2 rounded-lg -ml-2 transition-colors"
                      role="listitem"
                      aria-label={`${session.subject} session from ${startTime} to ${endTime}, ${session.items} items, ${session.accuracyPct}% accuracy${session.mastered ? ', mastered' : ''}${session.mistakes > 0 ? `, ${session.mistakes} mistakes` : ''}`}
                      onClick={() => onSessionClick?.(session)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSessionClick?.(session);
                        }
                      }}
                      tabIndex={0}
                    >
                      {/* Icon */}
                      <div className={`relative z-10 flex-shrink-0 p-2 rounded-full ${iconColor}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{session.subject}</span>
                              <Badge variant="outline" className="text-xs">
                                {session.level}
                              </Badge>
                              {session.mastered && (
                                <Badge variant="default" className="text-xs">
                                  Mastered
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              <span>
                                {startTime} – {endTime} ({duration} min)
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/30 border">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Items</div>
                            <div className="text-lg font-semibold">{session.items}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Accuracy</div>
                            <div className={`text-lg font-semibold ${getAccuracyColor(session.accuracyPct)}`}>
                              {session.accuracyPct}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Mistakes</div>
                            <div className={`text-lg font-semibold ${session.mistakes > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                              {session.mistakes}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
