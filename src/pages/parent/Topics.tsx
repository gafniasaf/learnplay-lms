import { useNavigate, useSearchParams } from "react-router-dom";
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
// Live data only (mock mode is forbidden).
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
  const navigate = useNavigate();
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
    { enabled: Boolean(selectedStudentId) }
  );

  const loading = dashboardLoading || topicsLoading;

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

  if (dashboardError || topicsError) {
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

  if (!selectedStudentId) {
    return (
      <PageContainer>
        <ParentLayout>
          <Alert className="border-warning bg-warning/10">
            <AlertTitle>Student required</AlertTitle>
            <AlertDescription>
              Link a child or pass <code>?studentId=&lt;id&gt;</code> to view topics.
              <div className="mt-4">
                <Badge variant="outline" className="cursor-pointer" onClick={() => navigate("/parent/link-child")}>
                  Link Child
                </Badge>
              </div>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (!topicsData) {
    return (
      <PageContainer>
        <ParentLayout>
          <Alert variant="destructive">
            <AlertTitle>Unable to load topics</AlertTitle>
            <AlertDescription>
              No data was returned. This app will not fabricate mock topics—implement/fix the backend for <code>getParentTopics</code>.
              <div className="mt-4">
                <Badge variant="outline" className="cursor-pointer" onClick={() => refetch?.()}>
                  Retry
                </Badge>
              </div>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  const emptyState = Boolean(topicsData.emptyState);
  const emptyMessage: string | null = topicsData.message ?? null;
  const rows = topicsData.topics?.map(mapTopicRecordToRow) ?? [];
  const buckets = bucketTopics(rows);
  const dayTopics: TopicRow[] = buckets.day.length > 0 ? buckets.day : rows.slice(0, 5);
  const weekTopics: TopicRow[] = buckets.week.length > 0 ? buckets.week : rows;
  const monthTopics: TopicRow[] = buckets.month.length > 0 ? buckets.month : rows;
  const summary = topicsData.summary ?? computeSummary(rows);

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
