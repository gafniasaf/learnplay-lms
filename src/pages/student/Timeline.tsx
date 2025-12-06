import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";
import { getRecentStudentSessions, type StudentSession } from "@/lib/student/mockSelectors";
import { useStudentRange } from "@/hooks/useStudentRange";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStudentTimeline } from "@/hooks/useStudentTimeline";
import { useMockData } from "@/lib/api";
import { mapStudentTimelineEventToSession } from "@/lib/student/timelineMappers";

export default function StudentTimeline() {
  const { window } = useStudentRange();
  const [filter, setFilter] = useState<'all' | 'mistakes' | 'mastered'>('all');
  const mockMode = useMockData();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useStudentTimeline({ limit: 100 }, { enabled: !mockMode });

  const liveSessions = useMemo<StudentSession[]>(() => {
    if (!data?.events) return [];
    return data.events
      .map(mapStudentTimelineEventToSession)
      .filter((session) => Boolean(session.startISO && session.endISO));
  }, [data?.events]);

  if (!mockMode && isLoading) {
    return (
      <PageContainer>
        <StudentLayout>
          <div className="py-12 text-center text-muted-foreground">Loading timeline…</div>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (!mockMode && isError) {
    const message = error instanceof Error ? error.message : "Unable to load timeline";

    return (
      <PageContainer>
        <StudentLayout>
          <Alert variant="destructive" className="max-w-xl">
            <AlertTitle>Unable to load timeline</AlertTitle>
            <AlertDescription>
              <p className="mb-4">{message}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (!mockMode && data && data.events.length === 0) {
    return (
      <PageContainer>
        <StudentLayout>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No activity recorded yet. Start a learning session to see your progress here.
              </p>
            </CardContent>
          </Card>
        </StudentLayout>
      </PageContainer>
    );
  }

  const allSessions = (mockMode ? [] : liveSessions).length > 0
    ? (mockMode ? [] : liveSessions)
    : getRecentStudentSessions(window);

  const filteredSessions = allSessions.filter((s) => {
    if (filter === 'mistakes') return s.accuracyPct < 100;
    if (filter === 'mastered') return s.accuracyPct >= 90;
    return true;
  });

  const sortedSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime()
  );

  return (
    <PageContainer>
      <StudentLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Timeline</h2>
              <p className="text-sm text-muted-foreground">Your learning history</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All
              </Button>
              <Button
                variant={filter === 'mistakes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('mistakes')}
              >
                Mistakes
              </Button>
              <Button
                variant={filter === 'mastered' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('mastered')}
              >
                Mastered
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sessions found</p>
              ) : (
                sortedSessions.map((session, idx) => {
                  const duration = differenceInMinutes(parseISO(session.endISO), parseISO(session.startISO));
                  const startTime = format(parseISO(session.startISO), 'MMM d, h:mm a');

                  return (
                    <div key={idx} className="flex items-start gap-4 p-3 rounded-md bg-muted/30">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium">{session.subject}</h3>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{startTime} • {duration} min</span>
                            </div>
                          </div>
                          <Badge variant={session.accuracyPct >= 80 ? "default" : "secondary"}>
                            {session.accuracyPct}%
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">{session.items} items answered</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    </PageContainer>
  );
}

