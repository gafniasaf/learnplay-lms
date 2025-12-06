import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActivityTimeline, type SessionActivity } from "@/components/parent/ActivityTimeline";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, ExternalLink, AlertCircle } from "lucide-react";
import { format, parseISO, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useParentTimeline } from "@/hooks/useParentTimeline";
import { useMockData } from "@/lib/api";
import { mapTimelineEventToSession } from "@/lib/parent/timelineMappers";

type FilterType = "all" | "mistakes" | "mastered";

const MOCK_ACTIVITIES: SessionActivity[] = [
  {
    startISO: "2025-01-15T14:30:00Z",
    endISO: "2025-01-15T15:15:00Z",
    subject: "Mathematics",
    level: "Grade 4",
    items: 12,
    accuracyPct: 85,
    mastered: false,
    mistakes: 2,
  },
  {
    startISO: "2025-01-15T10:15:00Z",
    endISO: "2025-01-15T10:45:00Z",
    subject: "Science",
    level: "Grade 4",
    items: 8,
    accuracyPct: 92,
    mastered: true,
    mistakes: 0,
  },
  {
    startISO: "2025-01-15T08:30:00Z",
    endISO: "2025-01-15T09:00:00Z",
    subject: "English",
    level: "Grade 4",
    items: 10,
    accuracyPct: 78,
    mastered: false,
    mistakes: 3,
  },
  {
    startISO: "2025-01-14T16:45:00Z",
    endISO: "2025-01-14T17:35:00Z",
    subject: "English",
    level: "Grade 4",
    items: 15,
    accuracyPct: 88,
    mastered: false,
    mistakes: 2,
  },
  {
    startISO: "2025-01-14T11:00:00Z",
    endISO: "2025-01-14T11:35:00Z",
    subject: "History",
    level: "Grade 4",
    items: 10,
    accuracyPct: 95,
    mastered: true,
    mistakes: 0,
  },
  {
    startISO: "2025-01-13T15:20:00Z",
    endISO: "2025-01-13T16:00:00Z",
    subject: "Geography",
    level: "Grade 4",
    items: 12,
    accuracyPct: 82,
    mastered: false,
    mistakes: 2,
  },
  {
    startISO: "2025-01-13T10:00:00Z",
    endISO: "2025-01-13T10:40:00Z",
    subject: "Science",
    level: "Grade 4",
    items: 14,
    accuracyPct: 71,
    mastered: false,
    mistakes: 5,
  },
];

export default function Timeline() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [selectedSession, setSelectedSession] = useState<SessionActivity | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dateInitialized, setDateInitialized] = useState(false);

  useEffect(() => {
    const subjectParam = searchParams.get("subject");
    const dateParam = searchParams.get("date");

    if (dateParam) {
      try {
        const date = parseISO(dateParam);
        setSelectedDate(date);
        setDateInitialized(true);
      } catch (e) {
        console.error("Invalid date in query params", e);
      }
    }

    if (subjectParam) {
      // Reserved for future subject highlighting
    }
  }, [searchParams]);

  const mockMode = useMockData();
  const studentIdParam = searchParams.get("studentId") ?? undefined;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useParentTimeline(
    {
      studentId: studentIdParam,
      limit: 100,
    },
    { enabled: !mockMode }
  );

  const timelineEvents = data?.events ?? [];

  const apiActivities = useMemo(() => {
    if (timelineEvents.length === 0) return [];

    return timelineEvents
      .map(mapTimelineEventToSession)
      .sort(
        (a, b) =>
          new Date(b.startISO).getTime() - new Date(a.startISO).getTime()
      );
  }, [timelineEvents]);

  useEffect(() => {
    if (!mockMode && !dateInitialized && apiActivities.length > 0) {
      const firstDate = parseISO(apiActivities[0].startISO);
      setSelectedDate(firstDate);
      setDateInitialized(true);
    }
  }, [mockMode, apiActivities, dateInitialized]);

  const allActivities = mockMode ? MOCK_ACTIVITIES : apiActivities;

  const sessionsForDate = useMemo(() => {
    return allActivities.filter((session) =>
      isSameDay(parseISO(session.startISO), selectedDate)
    );
  }, [allActivities, selectedDate]);

  const filteredSessions = useMemo(() => {
    let result = [...sessionsForDate];

    switch (activeFilter) {
      case "mistakes":
        result = result.filter((s) => s.mistakes > 0);
        break;
      case "mastered":
        result = result.filter((s) => s.mastered);
        break;
      default:
        break;
    }

    return result.sort(
      (a, b) =>
        new Date(b.startISO).getTime() - new Date(a.startISO).getTime()
    );
  }, [sessionsForDate, activeFilter]);

  const filters = useMemo(
    () => [
      {
        value: "all" as const,
        label: "All",
        count: sessionsForDate.length,
      },
      {
        value: "mistakes" as const,
        label: "Mistakes Only",
        count: sessionsForDate.filter((s) => s.mistakes > 0).length,
      },
      {
        value: "mastered" as const,
        label: "Mastered Only",
        count: sessionsForDate.filter((s) => s.mastered).length,
      },
    ],
    [sessionsForDate]
  );

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setDateInitialized(true);
      const params = new URLSearchParams(searchParams);
      params.set("date", date.toISOString());
      setSearchParams(params);
    }
  };

  const handleSessionClick = (session: SessionActivity) => {
    setSelectedSession(session);
    setSheetOpen(true);
  };

  const handleOpenInTopics = () => {
    if (selectedSession) {
      const params = new URLSearchParams({
        subject: selectedSession.subject,
        date: selectedSession.startISO,
      });
      navigate(`/parent/topics?${params.toString()}`);
    }
  };

  const errorMessage =
    error instanceof Error
      ? error.message
      : "Failed to load timeline data.";

  const emptyStateMessage =
    !mockMode && !isLoading && apiActivities.length === 0
      ? data?.message || "No activity found for the selected filters."
      : null;

  if (!mockMode && isLoading) {
    return (
      <PageContainer>
        <ParentLayout>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading activity timeline…
            </CardContent>
          </Card>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (!mockMode && isError) {
    return (
      <PageContainer>
        <ParentLayout>
          <Alert variant="destructive">
            <AlertTitle>Unable to load timeline</AlertTitle>
            <AlertDescription>
              {errorMessage}
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ParentLayout>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Activity Timeline</h1>
            <p className="text-muted-foreground mt-2">
              Complete history of learning sessions and activities.
            </p>
          </div>

          {emptyStateMessage && (
            <Alert variant="default">
              <AlertTitle>No activity yet</AlertTitle>
              <AlertDescription>{emptyStateMessage}</AlertDescription>
            </Alert>
          )}

          {/* Date Picker & Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                {/* Date Picker */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Select Date:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[240px] justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateChange}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

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
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <ActivityTimeline 
            sessions={filteredSessions} 
            onSessionClick={handleSessionClick}
          />

          {/* Session Detail Sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              {selectedSession && (
                <>
                  <SheetHeader>
                    <SheetTitle>{selectedSession.subject}</SheetTitle>
                    <SheetDescription>
                      {format(parseISO(selectedSession.startISO), "PPP 'at' p")}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <div className="text-2xl font-bold">{selectedSession.items}</div>
                          <div className="text-xs text-muted-foreground mt-1">Items Attempted</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <div className={cn(
                            "text-2xl font-bold",
                            selectedSession.accuracyPct >= 90 ? "text-success" :
                            selectedSession.accuracyPct >= 80 ? "text-warning" :
                            "text-destructive"
                          )}>
                            {selectedSession.accuracyPct}%
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Accuracy</div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Level & Status */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Level</span>
                        <Badge variant="outline">{selectedSession.level}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Mistakes</span>
                        <Badge variant={selectedSession.mistakes > 0 ? "destructive" : "secondary"}>
                          {selectedSession.mistakes}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge variant={selectedSession.mastered ? "default" : "outline"}>
                          {selectedSession.mastered ? "Mastered" : "In Progress"}
                        </Badge>
                      </div>
                    </div>

                    {/* Hardest Items - Placeholder */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Hardest Items</h4>
                      <Card className="border-dashed">
                        <CardContent className="pt-6">
                          <div className="text-center text-sm text-muted-foreground py-4">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Detailed item breakdown coming soon</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-4 border-t">
                      <Button 
                        className="w-full" 
                        onClick={handleOpenInTopics}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in Topics
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        View related topics and learning progress
                      </p>
                    </div>
                  </div>
                </>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </ParentLayout>
    </PageContainer>
  );
}
