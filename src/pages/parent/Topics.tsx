import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { TopicsHandled, type TopicRow } from "@/components/parent/TopicsHandled";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Info, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMockData } from "@/lib/api";
import { useParentDashboard } from "@/hooks/useParentDashboard";
import { useParentTopics } from "@/hooks/useParentTopics";
import { differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { humanizeLabel } from "@/lib/parent/timelineMappers";

const safeNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
};

const mapStatus = (action: string | null | undefined): TopicRow["status"] => {
  switch (action) {
    case "advance":
      return "Mastered";
    case "maintain":
    case "practice":
      return "Practicing";
    case "review":
    default:
      return "New";
  }
};

const mapTopicRecordToRow = (record: {
  topic?: string;
  subject?: string;
  lastPracticedAt?: string | null;
  attempts?: number;
  correctCount?: number;
  accuracyPct?: number;
  recommendedAction?: string;
}): TopicRow => {
  const topicName = record.topic ?? (record as Record<string, unknown>).topicTitle ?? "Topic";
  const subjectName = record.subject ?? "General";
  const iso = record.lastPracticedAt ?? new Date().toISOString();
  const parsed = parseISO(iso);
  const validDate = isValid(parsed) ? iso : new Date().toISOString();

  return {
    date: validDate,
    subject: humanizeLabel(String(subjectName)),
    topic: humanizeLabel(String(topicName)),
    minutes: Math.max(safeNumber(record.attempts), safeNumber(record.correctCount)),
    items: safeNumber(record.attempts),
    accuracyPct: Math.round(safeNumber(record.accuracyPct)),
    status: mapStatus(record.recommendedAction),
  };
};

const computeSummary = (rows: TopicRow[]) => {
  if (rows.length === 0) {
    return {
      totalTopics: 0,
      averageAccuracy: 0,
      topicsNeedingReview: 0,
      topicsForPractice: 0,
      topicsMastered: 0,
    };
  }

  const totalAccuracy = rows.reduce((sum, row) => sum + safeNumber(row.accuracyPct), 0);
  const reviewCount = rows.filter((row) => row.status === "New" || row.accuracyPct < 60).length;
  const practiceCount = rows.filter((row) => row.status === "Practicing" && row.accuracyPct >= 60 && row.accuracyPct < 90).length;
  const masteredCount = rows.filter((row) => row.status === "Mastered" || row.accuracyPct >= 90).length;

  return {
    totalTopics: rows.length,
    averageAccuracy: Math.round(totalAccuracy / rows.length),
    topicsNeedingReview: reviewCount,
    topicsForPractice: practiceCount,
    topicsMastered: masteredCount,
  };
};

const bucketTopics = (rows: TopicRow[]) => {
  const now = new Date();
  const day: TopicRow[] = [];
  const week: TopicRow[] = [];
  const month: TopicRow[] = [];

  rows.forEach((row) => {
    const date = parseISO(row.date);
    const diff = isValid(date) ? differenceInCalendarDays(now, date) : 0;

    if (diff <= 1) {
      day.push(row);
    }
    if (diff <= 7) {
      week.push(row);
    }
    if (diff <= 30) {
      month.push(row);
    } else if (!month.includes(row)) {
      month.push(row);
    }
  });

  return { day, week, month: month.length > 0 ? month : rows };
};

export default function Topics() {
  const mockMode = useMockData();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFromParams = searchParams.get("studentId");

  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError: dashboardError,
    error: dashboardErrorObj,
  } = useParentDashboard();

  const students = dashboard?.children ?? [];
  const defaultStudentId = selectedFromParams ?? students[0]?.studentId ?? null;
  const selectedStudentId = defaultStudentId;
  const selectedStudentName = students.find((child) => child.studentId === selectedStudentId)?.studentName ?? students[0]?.studentName ?? "Student";

  const {
    data: topicsData,
    isLoading: topicsLoading,
    isError: topicsError,
    error: topicsErrorObj,
    refetch,
  } = useParentTopics(
    selectedStudentId ? { studentId: selectedStudentId } : null,
    { enabled: !mockMode && Boolean(selectedStudentId) }
  );

  const loading = !mockMode && (dashboardLoading || topicsLoading);

  if (loading) {
    return (
      <PageContainer>
        <ParentLayout>
          <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-[420px] w-full" />
          </div>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (!mockMode && (dashboardError || topicsError)) {
    const message = dashboardErrorObj instanceof Error ? dashboardErrorObj.message : topicsErrorObj instanceof Error ? topicsErrorObj.message : "Unable to load topics.";
    return (
      <PageContainer>
        <ParentLayout>
          <Alert variant="destructive">
            <AlertTitle>Unable to load topics</AlertTitle>
            <AlertDescription>
              {message}
              <div className="mt-4">
                <Badge
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => refetch?.()}
                >
                  Retry
                </Badge>
              </div>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  // Mock data fallbacks
  let dayTopics: TopicRow[] = mockTopicsDaily;
  let weekTopics: TopicRow[] = mockTopicsWeekly;
  let monthTopics: TopicRow[] = mockTopicsMonthly;
  let summary = computeSummary([...mockTopicsWeekly, ...mockTopicsMonthly]);
  let emptyState = false;
  let emptyMessage: string | null = null;

  if (!mockMode && topicsData) {
    emptyState = topicsData.emptyState;
    emptyMessage = topicsData.message ?? null;

    const rows = topicsData.topics?.map(mapTopicRecordToRow) ?? [];

    if (rows.length > 0) {
      const buckets = bucketTopics(rows);
      dayTopics = buckets.day.length > 0 ? buckets.day : rows.slice(0, 5);
      weekTopics = buckets.week.length > 0 ? buckets.week : rows;
      monthTopics = buckets.month.length > 0 ? buckets.month : rows;
    } else {
      dayTopics = [];
      weekTopics = [];
      monthTopics = [];
    }

    summary = topicsData.summary ?? computeSummary(rows);
  }

  const handleStudentChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("studentId", value);
    setSearchParams(params);
  };

  return (
    <PageContainer>
      <ParentLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Topics Overview</h1>
              <p className="text-muted-foreground mt-2">
                Track topics completed and accuracy rates across timeframes.
              </p>
            </div>
            {students.length > 0 && (
              <div className="w-full sm:w-64">
                <Select
                  value={selectedStudentId ?? ""}
                  onValueChange={(val) => handleStudentChange(val)}
                >
                  <SelectTrigger aria-label="Select child">
                    <SelectValue placeholder="Select child" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((child) => (
                      <SelectItem key={child.studentId} value={child.studentId}>
                        {child.studentName || child.studentId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm space-y-1">
                <p className="font-medium">Showing topics for {selectedStudentName}</p>
                <p className="text-muted-foreground">
                  Use filters to target review sessions. Select a different child to change the data set.
                </p>
              </div>
            </CardContent>
          </Card>

          {summary && summary.totalTopics > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Topic Insights</p>
                  <h2 className="text-xl font-semibold">{summary.totalTopics} topics tracked</h2>
                  <p className="text-sm text-muted-foreground">
                    {summary.topicsNeedingReview === 1
                      ? "1 topic needs review"
                      : `${summary.topicsNeedingReview} topics need review`} · Average accuracy {summary.averageAccuracy}%
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={summary.topicsNeedingReview > 0 ? "destructive" : "outline"}>
                    {summary.topicsNeedingReview} review
                  </Badge>
                  <Badge variant="outline">{summary.topicsForPractice} practice</Badge>
                  <Badge variant="outline">{summary.topicsMastered} mastered</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {emptyState ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center space-y-3">
                <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="font-medium">No topic data yet</p>
                <p className="text-sm text-muted-foreground">
                  {emptyMessage || "Once your child starts practicing, you'll see detailed topic analytics here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <TopicsHandled
              day={dayTopics}
              week={weekTopics}
              month={monthTopics}
            />
          )}
        </div>
      </ParentLayout>
    </PageContainer>
  );
}

// Mock data retained for mock mode fallbacks
const mockTopicsDaily: TopicRow[] = [
  {
    date: "2025-01-15T14:30:00Z",
    subject: "Mathematics",
    topic: "Fractions - Adding Like Denominators",
    minutes: 25,
    items: 12,
    accuracyPct: 85,
    status: "Practicing",
  },
  {
    date: "2025-01-15T10:15:00Z",
    subject: "Science",
    topic: "Photosynthesis Process",
    minutes: 30,
    items: 8,
    accuracyPct: 90,
    status: "Mastered",
  },
  {
    date: "2025-01-15T08:45:00Z",
    subject: "English",
    topic: "Verb Tenses - Past Perfect",
    minutes: 20,
    items: 15,
    accuracyPct: 78,
    status: "New",
  },
  {
    date: "2025-01-15T07:30:00Z",
    subject: "History",
    topic: "Ancient Rome - Republic Era",
    minutes: 18,
    items: 10,
    accuracyPct: 82,
    status: "Practicing",
  },
];

const mockTopicsWeekly: TopicRow[] = [
  {
    date: "2025-01-15T14:30:00Z",
    subject: "Mathematics",
    topic: "Fractions - Mixed Numbers",
    minutes: 120,
    items: 45,
    accuracyPct: 82,
    status: "Practicing",
  },
  {
    date: "2025-01-14T11:00:00Z",
    subject: "Science",
    topic: "Cell Structure",
    minutes: 95,
    items: 32,
    accuracyPct: 88,
    status: "Mastered",
  },
  {
    date: "2025-01-13T15:20:00Z",
    subject: "English",
    topic: "Reading Comprehension",
    minutes: 110,
    items: 28,
    accuracyPct: 80,
    status: "Practicing",
  },
  {
    date: "2025-01-12T09:30:00Z",
    subject: "History",
    topic: "Ancient Civilizations",
    minutes: 75,
    items: 20,
    accuracyPct: 75,
    status: "New",
  },
  {
    date: "2025-01-11T16:00:00Z",
    subject: "Geography",
    topic: "Map Reading Skills",
    minutes: 60,
    items: 18,
    accuracyPct: 85,
    status: "Practicing",
  },
  {
    date: "2025-01-10T13:45:00Z",
    subject: "Mathematics",
    topic: "Geometry - Basic Shapes",
    minutes: 55,
    items: 22,
    accuracyPct: 91,
    status: "Mastered",
  },
  {
    date: "2025-01-10T10:15:00Z",
    subject: "Science",
    topic: "States of Matter",
    minutes: 48,
    items: 16,
    accuracyPct: 87,
    status: "Practicing",
  },
  {
    date: "2025-01-09T14:00:00Z",
    subject: "English",
    topic: "Grammar - Adjectives",
    minutes: 42,
    items: 19,
    accuracyPct: 79,
    status: "New",
  },
];

const mockTopicsMonthly: TopicRow[] = [
  {
    date: "2025-01-15T14:30:00Z",
    subject: "Mathematics",
    topic: "Algebra Basics",
    minutes: 480,
    items: 180,
    accuracyPct: 83,
    status: "Mastered",
  },
  {
    date: "2025-01-10T10:00:00Z",
    subject: "Science",
    topic: "Scientific Method",
    minutes: 420,
    items: 145,
    accuracyPct: 87,
    status: "Mastered",
  },
  {
    date: "2025-01-08T13:30:00Z",
    subject: "English",
    topic: "Essay Writing",
    minutes: 380,
    items: 95,
    accuracyPct: 81,
    status: "Practicing",
  },
  {
    date: "2025-01-05T11:15:00Z",
    subject: "History",
    topic: "World War II",
    minutes: 290,
    items: 72,
    accuracyPct: 76,
    status: "Practicing",
  },
  {
    date: "2025-01-03T14:45:00Z",
    subject: "Geography",
    topic: "Climate Zones",
    minutes: 245,
    items: 68,
    accuracyPct: 84,
    status: "Mastered",
  },
  {
    date: "2025-01-02T09:30:00Z",
    subject: "Mathematics",
    topic: "Decimals and Percentages",
    minutes: 310,
    items: 95,
    accuracyPct: 85,
    status: "Mastered",
  },
  {
    date: "2024-12-28T11:00:00Z",
    subject: "Science",
    topic: "Energy and Forces",
    minutes: 265,
    items: 78,
    accuracyPct: 82,
    status: "Practicing",
  },
  {
    date: "2024-12-25T15:30:00Z",
    subject: "English",
    topic: "Creative Writing",
    minutes: 220,
    items: 52,
    accuracyPct: 88,
    status: "Mastered",
  },
  {
    date: "2024-12-22T10:15:00Z",
    subject: "Art",
    topic: "Color Theory",
    minutes: 180,
    items: 42,
    accuracyPct: 92,
    status: "Mastered",
  },
  {
    date: "2024-12-20T13:45:00Z",
    subject: "History",
    topic: "Renaissance Period",
    minutes: 195,
    items: 58,
    accuracyPct: 77,
    status: "New",
  },
];
