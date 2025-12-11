import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow, parseISO } from "date-fns";
import { SubjectTimeChart } from "@/components/parent/SubjectTimeChart";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useParentSubjects } from "@/hooks/useParentSubjects";
// useMockData removed - useParentSubjects handles mock mode internally
import type {
  ParentSubjectRecord,
  ParentSubjectsResponse,
  ParentSubjectsSummary,
} from "@/lib/api/parentSubjects";
import { normalizeSubject, mapParentSubject, type MappedParentSubject } from "@/lib/parent/subjectsMappers";

interface DisplaySubject {
  id: string;
  name: string;
  mastery: number;
  sessions: number;
  recentAccuracy: number;
  previousAccuracy: number;
  accuracyDelta: number | null;
  trend: string;
  alertFlag: boolean;
  lastPracticedAt: string | null;
  statusLabel: string;
  statusKey: string;
}

type SubjectsQueryData = ParentSubjectsResponse & {
  subjects: MappedParentSubject[];
};

const formatSubjectLabel = normalizeSubject;

const computeSummary = (subjects: ParentSubjectRecord[]): ParentSubjectsSummary => {
  if (subjects.length === 0) {
    return {
      totalSubjects: 0,
      averageMastery: 0,
      subjectsWithAlerts: 0,
    };
  }

  const totalMastery = subjects.reduce((sum, item) => sum + (item.masteryPct ?? 0), 0);
  const alerts = subjects.filter((item) => item.alertFlag).length;

  return {
    totalSubjects: subjects.length,
    averageMastery: Math.round(totalMastery / subjects.length),
    subjectsWithAlerts: alerts,
  };
};

const getTrendMeta = (trend: string, delta: number | null) => {
  if (delta === null || Number.isNaN(delta)) {
    return {
      icon: Minus,
      label: formatSubjectLabel(trend || "Stable"),
      tone: "text-muted-foreground",
    };
  }

  if (delta > 0) {
    return {
      icon: TrendingUp,
      label: `+${Math.abs(delta)}%`,
      tone: "text-success",
    };
  }

  if (delta < 0) {
    return {
      icon: TrendingDown,
      label: `-${Math.abs(delta)}%`,
      tone: "text-destructive",
    };
  }

  return {
    icon: Minus,
    label: "No change",
    tone: "text-muted-foreground",
  };
};

const MOCK_SUBJECTS: ParentSubjectRecord[] = [
  {
    subject: "algebra-fundamentals",
    masteryPct: 72,
    trend: "up",
    alertFlag: false,
    totalSessions: 18,
    recentAccuracy: 84,
    previousAccuracy: 78,
    lastPracticedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    subject: "reading-comprehension",
    masteryPct: 63,
    trend: "stable",
    alertFlag: false,
    totalSessions: 12,
    recentAccuracy: 80,
    previousAccuracy: 79,
    lastPracticedAt: new Date(Date.now() - 1000 * 60 * 60 * 16).toISOString(),
  },
  {
    subject: "science-inquiry",
    masteryPct: 48,
    trend: "down",
    alertFlag: true,
    totalSessions: 7,
    recentAccuracy: 62,
    previousAccuracy: 70,
    lastPracticedAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
];

const MOCK_RESPONSE: SubjectsQueryData = {
  subjects: MOCK_SUBJECTS.map(mapParentSubject),
  summary: computeSummary(MOCK_SUBJECTS),
  emptyState: false,
};

export default function Subjects() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const studentIdParam = searchParams.get("studentId") ?? undefined;
  const mockMode = (import.meta as any).env?.VITE_USE_MOCK === 'true';

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useParentSubjects<SubjectsQueryData>(
    { studentId: studentIdParam },
    {
      enabled: !mockMode,
      select: (response) =>
        ({
          ...response,
          subjects: response.subjects?.map(mapParentSubject) ?? [],
        }) as SubjectsQueryData,
    }
  );

  const response = useMemo<SubjectsQueryData>(() => {
    if (mockMode || !data) {
      return MOCK_RESPONSE;
    }

    const subjects = data.subjects ?? [];
    const summary = data.summary ?? computeSummary(subjects);

    return {
      subjects,
      summary,
      emptyState: Boolean(data.emptyState),
      message: data.message,
    } satisfies SubjectsQueryData;
  }, [mockMode, data]);

  const displaySubjects = useMemo<DisplaySubject[]>(
    () =>
      (response.subjects ?? []).map((subject) => {
        const recent = subject.recentAccuracy ?? 0;
        const previous = subject.previousAccuracy ?? recent;
        const delta = subject.recentAccuracy != null && subject.previousAccuracy != null
          ? Math.round(recent - previous)
          : null;

        return {
          id: subject.subject,
          name: subject.normalizedSubject ?? formatSubjectLabel(subject.subject),
          mastery: Math.round(subject.masteryPct ?? 0),
          sessions: subject.totalSessions ?? 0,
          recentAccuracy: Math.round(recent),
          previousAccuracy: Math.round(previous),
          accuracyDelta: delta,
          trend: subject.trend?.toString() ?? "stable",
          alertFlag: Boolean(subject.alertFlag),
          lastPracticedAt: subject.lastPracticedAt ?? null,
          statusLabel: subject.statusLabel ?? "Track",
          statusKey: subject.statusKey ?? "",
        } satisfies DisplaySubject;
      }),
    [response.subjects]
  );

  const summary = useMemo(() => {
    if (response.summary) {
      return response.summary;
    }
    return computeSummary(response.subjects ?? []);
  }, [response.summary, response.subjects]);

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const allSubjects = useMemo(
    () => displaySubjects.map((subject) => subject.name),
    [displaySubjects]
  );

  const filteredSubjects = useMemo(() => {
    if (selectedSubjects.length === 0) {
      return displaySubjects;
    }

    return displaySubjects.filter((subject) =>
      selectedSubjects.includes(subject.name)
    );
  }, [displaySubjects, selectedSubjects]);

  const chartData = filteredSubjects.map((subject) => ({
    subject: subject.name,
    value: Math.max(subject.sessions, 0),
  }));

  const topSubjects = useMemo(
    () => [...filteredSubjects].sort((a, b) => b.mastery - a.mastery),
    [filteredSubjects]
  );

  const handleSubjectToggle = (subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject)
        ? prev.filter((item) => item !== subject)
        : [...prev, subject]
    );
  };

  const clearFilters = () => setSelectedSubjects([]);

  const handleExportCSV = () => {
    const headers = [
      "Subject",
      "Mastery (%)",
      "Sessions",
      "Recent Accuracy (%)",
      "Previous Accuracy (%)",
      "Accuracy Δ",
      "Last Practiced",
      "Alerts",
    ];

    const rows = filteredSubjects.map((subject) => [
      subject.name,
      subject.mastery.toString(),
      subject.sessions.toString(),
      subject.recentAccuracy.toString(),
      subject.previousAccuracy.toString(),
      subject.accuracyDelta != null ? subject.accuracyDelta.toString() : "N/A",
      subject.lastPracticedAt
        ? formatDistanceToNow(parseISO(subject.lastPracticedAt), { addSuffix: true })
        : "—",
      subject.alertFlag ? "Yes" : "No",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "parent-subjects.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "CSV exported",
      description: "Subject performance data downloaded successfully.",
    });
  };

  const emptyStateMessage = !mockMode && response.emptyState
    ? response.message ?? "No activity recorded yet."
    : null;

  if (!mockMode && isLoading) {
    return (
      <PageContainer>
        <ParentLayout>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading subject performance…
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
            <AlertTitle>Unable to load subjects</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Please try again in a moment."}
              <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  const hasSubjects = displaySubjects.length > 0;

  if (!mockMode && !hasSubjects) {
    return (
      <PageContainer>
        <ParentLayout>
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-60" />
              <h2 className="text-lg font-semibold">No subject activity available</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {emptyStateMessage ?? "Once your child starts learning sessions, their subjects will appear here."}
              </p>
              <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                Refresh
              </Button>
            </CardContent>
          </Card>
        </ParentLayout>
      </PageContainer>
    );
  }

  const filtersYieldNoResults = filteredSubjects.length === 0 && displaySubjects.length > 0;

  return (
    <PageContainer>
      <ParentLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Subject Performance</h1>
            <p className="text-muted-foreground mt-2">
              Monitor mastery, accuracy trends, and recent activity across each subject.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Subjects tracked</p>
                <p className="text-3xl font-bold mt-2">{summary.totalSubjects}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Average mastery</p>
                <p className="text-3xl font-bold mt-2">{summary.averageMastery}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Alerts</p>
                    <p className="text-3xl font-bold mt-2">{summary.subjectsWithAlerts}</p>
                  </div>
                  {summary.subjectsWithAlerts > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Needs attention
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Subjects
                  {selectedSubjects.length > 0 && (
                    <Badge variant="secondary" className="ml-2 px-1.5 py-0.5">
                      {selectedSubjects.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card">
                <DropdownMenuLabel>Select subjects</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allSubjects.map((subject) => (
                  <DropdownMenuCheckboxItem
                    key={subject}
                    checked={selectedSubjects.includes(subject)}
                    onCheckedChange={() => handleSubjectToggle(subject)}
                  >
                    {subject}
                  </DropdownMenuCheckboxItem>
                ))}
                {selectedSubjects.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={clearFilters}
                    >
                      Clear all
                    </Button>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {emptyStateMessage && (
            <Alert variant="default">
              <AlertTitle>All quiet</AlertTitle>
              <AlertDescription>{emptyStateMessage}</AlertDescription>
            </Alert>
          )}

          {filteredSubjects.length > 0 ? (
            <SubjectTimeChart bySubject={chartData} unitLabel="sessions" />
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                Adjust your filters to see subject trends.
              </CardContent>
            </Card>
          )}

          {filtersYieldNoResults ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-60" />
                <p className="text-lg font-medium">No data for the selected subjects</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Try clearing filters to view all subjects again.
                </p>
                <Button className="mt-4" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Subject details</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Mastery, accuracy, and recent activity for each subject.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" role="table" aria-label="Subjects performance table">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-3 px-4 text-sm font-semibold">Subject</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold">Mastery</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold">Recent accuracy</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold">Sessions</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold">Trend</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold">Last practiced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSubjects.map((subject) => {
                        const trendMeta = getTrendMeta(subject.trend, subject.accuracyDelta);
                        const TrendIcon = trendMeta.icon;

                        return (
                          <tr
                            key={subject.id}
                            className="border-b hover:bg-accent/5 transition-colors"
                          >
                            <td className="py-3 px-4 font-medium">
                              <div className="flex items-center gap-2">
                                <span>{subject.name}</span>
                                {subject.alertFlag && (
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Alert
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">
                              {subject.mastery}%
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-semibold">{subject.recentAccuracy}%</span>
                              <span className="text-xs text-muted-foreground block">
                                Prev {subject.previousAccuracy}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">{subject.sessions}</td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="gap-1">
                                <TrendIcon className={`h-3 w-3 ${trendMeta.tone}`} />
                                <span className={trendMeta.tone}>{trendMeta.label}</span>
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {subject.lastPracticedAt
                                ? formatDistanceToNow(parseISO(subject.lastPracticedAt), { addSuffix: true })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ParentLayout>
    </PageContainer>
  );
}
