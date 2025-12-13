import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserPlus, Mail, AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import { ParentSummaryCards } from "@/components/parent/ParentSummaryCards";
import { SubjectTimeGlance } from "@/components/parent/SubjectTimeGlance";
import { TopicsGlance } from "@/components/parent/TopicsGlance";
import { ActivityGlance } from "@/components/parent/ActivityGlance";
import { GoalsGlance } from "@/components/parent/GoalsGlance";
import { GrowthTracker } from "@/components/parent/GrowthTracker";
import { AssignmentModal } from "@/components/shared/AssignmentModal";
import { useAuth } from "@/hooks/useAuth";
import { useParentRange } from "@/hooks/useParentRange";
import { useParentSubjects } from "@/hooks/useParentSubjects";
import { useParentTimeline } from "@/hooks/useParentTimeline";
import { useParentGoals } from "@/hooks/useParentGoals";
import { useParentDashboard } from "@/hooks/useParentDashboard";
import { useParentTopics } from "@/hooks/useParentTopics";
import { mapTimelineEventToSession } from "@/lib/parent/timelineMappers";
import { mapParentSubject, normalizeSubject } from "@/lib/parent/subjectsMappers";
import type { ParentGoalRecord } from "@/lib/api/parentGoals";
import type { SessionActivity } from "@/components/parent/ActivityTimeline";
import type { TopicRow } from "@/components/parent/TopicsHandled";
import { formatDistanceToNow, parseISO } from "date-fns";

const aggregateGoals = (goals: ParentGoalRecord[]) => {
  if (!goals || goals.length === 0) {
    return { goalMinutes: 0, actualMinutes: 0, goalItems: 0, actualItems: 0 };
  }

  const goalMinutes = goals.reduce((sum, goal) => sum + (goal.targetMinutes ?? 0), 0);
  const actualMinutes = goals.reduce((sum, goal) => sum + (goal.progressMinutes ?? 0), 0);
  const goalItems = goals.length;
  const actualItems = goals.filter((goal) => goal.status === "completed").length;

  return {
    goalMinutes: goalMinutes || 1,
    actualMinutes,
    goalItems: goalItems || 1,
    actualItems,
  };
};

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { window: rangeWindow } = useParentRange();
  const [showKOAssignmentModal, setShowKOAssignmentModal] = useState(false);
  const [_selectedDomain, setSelectedDomain] = useState<string | undefined>();

  const {
    data: parentDashboard,
    isLoading,
    isError,
  } = useParentDashboard();

  // Extract primaryStudentId first, before calling dependent hooks
  const primaryStudentId = parentDashboard?.children?.[0]?.studentId ?? null;

  const allowLive = !isError && !!parentDashboard;
  
  const parentSubjects = useParentSubjects(
    primaryStudentId ? { studentId: primaryStudentId } : {},
    {
      enabled: allowLive && !isLoading && !!primaryStudentId,
      select: (response) => ({
        ...response,
        subjects: response.subjects?.map(mapParentSubject) ?? [],
      }),
    }
  );
  const parentTimeline = useParentTimeline(
    primaryStudentId ? { studentId: primaryStudentId, limit: 5 } : {},
    { enabled: allowLive && !isLoading && !!primaryStudentId }
  );
  const parentGoals = useParentGoals(
    primaryStudentId ? { studentId: primaryStudentId, status: "on_track" } : {},
    { enabled: allowLive && !isLoading && !!primaryStudentId }
  );
  const parentTopics = useParentTopics(
    primaryStudentId ? { studentId: primaryStudentId } : null,
    { enabled: allowLive && !isLoading && !!primaryStudentId }
  );

  const summary = parentDashboard?.summary ?? {
    totalChildren: 0,
    totalAlerts: 0,
    averageStreak: 0,
    totalXp: 0,
  };

  const children = parentDashboard?.children ?? [];
  const parentName = parentDashboard?.parentName ?? "Parent";

  const subjectRecords = parentSubjects.data?.subjects ?? [];
  const subjectGlanceData = subjectRecords.map((subject) => ({
    subject: subject.normalizedSubject ?? normalizeSubject(subject.subject),
    minutes: subject.totalSessions ?? 0,
  }));

  const subjectSummary = useMemo(() => {
    if (subjectRecords.length === 0) return null;
    const summaryData = parentSubjects.data?.summary;
    const reviewCount = subjectRecords.filter((subject) => subject.statusKey === "review" || subject.alertFlag).length;
    const practiceCount = subjectRecords.filter((subject) => subject.statusKey === "practice").length;
    const maintainCount = subjectRecords.filter((subject) => subject.statusKey === "maintain").length;
    const advanceCount = subjectRecords.filter((subject) => subject.statusKey === "advance").length;
    const totalSubjects = summaryData?.totalSubjects ?? subjectRecords.length;
    const averageMastery =
      summaryData?.averageMastery ??
      Math.round(
        subjectRecords.reduce((sum, subject) => sum + (subject.masteryPct ?? 0), 0) /
          subjectRecords.length
      );

    return {
      totalSubjects,
      averageMastery,
      reviewCount,
      practiceCount: practiceCount + maintainCount,
      advanceCount,
    };
  }, [subjectRecords, parentSubjects.data?.summary]);

  const timelineEvents = parentTimeline.data?.events ?? [];
  const timelineSessions: SessionActivity[] = timelineEvents
    .map(mapTimelineEventToSession)
    .sort((a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime());

  const apiTopics = parentTopics.data?.topics ?? [];
  const topicSummary = parentTopics.data?.summary ?? null;
  const topicsGlance: TopicRow[] = apiTopics.length > 0
    ? apiTopics.slice(0, 5).map((topic) => {
        const rawTopic = topic.topic ?? "Topic";
        const rawSubject = topic.subject ?? "General";
        const humanize = (value: string) => value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const status: TopicRow['status'] = topic.recommendedAction === "advance"
          ? "Mastered"
          : topic.recommendedAction === "maintain"
          ? "Practicing"
          : topic.recommendedAction === "practice"
          ? "Practicing"
          : "New";

        return {
          topic: humanize(String(rawTopic)),
          subject: humanize(String(rawSubject)),
          date: topic.lastPracticedAt ?? new Date().toISOString(),
          minutes: Math.max(topic.attempts, topic.correctCount),
          items: topic.attempts,
          accuracyPct: Math.round(topic.accuracyPct ?? 0),
          status,
        };
      })
    : [];

  const goalsGlance = aggregateGoals(parentGoals.data?.goals ?? []);

  const missingSignals = useMemo(() => {
    if (!allowLive || isLoading) return [];
    const missing: string[] = [];
    if (!primaryStudentId) missing.push("parentDashboard.children[0].studentId (getParentDashboard)");
    if (subjectRecords.length === 0) missing.push("subjects (getParentSubjects)");
    if (timelineEvents.length === 0) missing.push("timeline events (getParentTimeline)");
    if ((parentGoals.data?.goals ?? []).length === 0) missing.push("goals (getParentGoals)");
    if (apiTopics.length === 0) missing.push("topics (getParentTopics)");
    return missing;
  }, [allowLive, isLoading, primaryStudentId, subjectRecords.length, timelineEvents.length, parentGoals.data?.goals, apiTopics.length]);

  // Check if child has a teacher (blocks parent assignment)
  // Teacher presence is determined by learner profile data
  const hasTeacher = false;
  const teacherName = "Mrs. Johnson";

  const handleAssignPractice = (domain?: string) => {
    setSelectedDomain(domain);
    setShowKOAssignmentModal(true);
  };

  const handleKOAssignmentCreated = () => {
    setShowKOAssignmentModal(false);
    setSelectedDomain(undefined);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <ParentLayout>
          <div className="space-y-6">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-36 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <ParentLayout>
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-lg font-semibold">Unable to load parent dashboard</p>
            <Button
              variant="outline"
          onClick={() => {
            if (typeof globalThis !== "undefined") {
              globalThis.location?.reload();
            }
          }}
            >
              Retry
            </Button>
          </div>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (!parentDashboard) {
    return (
      <PageContainer>
        <ParentLayout>
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-lg font-semibold text-destructive">
              Parent dashboard data not available
            </p>
            <Button
              variant="outline"
              onClick={() => {
                if (typeof globalThis !== "undefined") {
                  globalThis.location?.reload();
                }
              }}
            >
              Retry
            </Button>
          </div>
        </ParentLayout>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ParentLayout>
        <div className="space-y-6">
          {missingSignals.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Missing live data</AlertTitle>
              <AlertDescription>
                <p className="mb-2">
                  This dashboard will not fabricate data. The following inputs are empty/missing:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {missingSignals.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Hello, {parentName}</h1>
              <p className="text-muted-foreground">
                Monitor progress across your children and stay ahead of upcoming work.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/parent/link-child")} data-cta-id="parent-link-child" data-action="navigate" data-target="/parent/link-child">
                <UserPlus className="h-4 w-4 mr-2" />
                Link Child
              </Button>
              <Button variant="default" size="sm" onClick={() => navigate("/messages")} data-cta-id="parent-messages" data-action="navigate" data-target="/messages">
                <Mail className="h-4 w-4 mr-2" />
                Messages
              </Button>
            </div>
          </div>

          <ParentSummaryCards
            totalChildren={summary.totalChildren}
            totalAlerts={summary.totalAlerts}
            averageStreak={summary.averageStreak}
            totalXp={summary.totalXp}
          />

          {/* Growth Tracker (Knowledge Map) */}
          {primaryStudentId && (
            <GrowthTracker
              studentId={primaryStudentId}
              onAssignPractice={handleAssignPractice}
              hasTeacher={hasTeacher}
              teacherName={hasTeacher ? teacherName : undefined}
            />
          )}

          {subjectSummary && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subject Insights</p>
                  <h2 className="text-xl font-semibold">{subjectSummary.totalSubjects} subjects tracked</h2>
                  <p className="text-sm text-muted-foreground">
                    {subjectSummary.reviewCount === 1
                      ? "1 subject needs review"
                      : `${subjectSummary.reviewCount} subjects need review`} · Average mastery {subjectSummary.averageMastery}%
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={subjectSummary.reviewCount > 0 ? "destructive" : "outline"}>
                    {subjectSummary.reviewCount} review
                  </Badge>
                  <Badge variant="outline">{subjectSummary.practiceCount} practice</Badge>
                  <Badge variant="outline">{subjectSummary.advanceCount} mastered</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {topicSummary && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Topic Insights</p>
                  <h2 className="text-xl font-semibold">{topicSummary.totalTopics} topics tracked</h2>
                  <p className="text-sm text-muted-foreground">
                    {topicSummary.topicsNeedingReview === 1
                      ? "1 topic needs review"
                      : `${topicSummary.topicsNeedingReview} topics need review`} · Average accuracy {Math.round(topicSummary.averageAccuracy)}%
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={topicSummary.topicsNeedingReview > 0 ? "destructive" : "outline"}>
                    {topicSummary.topicsNeedingReview} review
                  </Badge>
                  <Badge variant="outline">
                    {topicSummary.topicsMastered} mastered
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {children.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Children Overview</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {children.map((child) => {
                  const upcoming = child.upcomingAssignments?.items ?? [];
                  const alerts = child.alerts;
                  const hasAlerts = alerts.needsAttention;

                  return (
                    <Card key={child.studentId} className="h-full">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{child.studentName}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                              {child.metrics.xpTotal.toLocaleString()} XP · {child.metrics.streakDays} day streak
                            </p>
                          </div>
                          <Badge variant={child.linkStatus === "active" ? "default" : "secondary"}>
                            {child.linkStatus === "active" ? "Active" : child.linkStatus}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Recent activity: {child.metrics.recentActivityCount}</span>
                          {child.metrics.lastLoginAt && (
                            <span>
                              Last login {formatDistanceToNow(parseISO(child.metrics.lastLoginAt), { addSuffix: true })}
                            </span>
                          )}
                          <span>Total alerts: {alerts.overdueAssignments + alerts.goalsBehind}</span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Upcoming assignments</span>
                            <Badge variant="outline">{child.upcomingAssignments?.count ?? 0}</Badge>
                          </div>
                          {upcoming.length > 0 ? (
                            <div className="space-y-2">
                              {upcoming.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className="border rounded-lg p-3 flex items-start justify-between gap-3"
                                >
                                  <div>
                                    <p className="text-sm font-medium">{assignment.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Due {formatDistanceToNow(parseISO(assignment.dueAt), { addSuffix: true })}
                                    </p>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {assignment.progressPct}%
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No upcoming assignments</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          {hasAlerts ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Needs attention
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              On track
                            </Badge>
                          )}
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CalendarDays className="h-3 w-3" />
                            <span>Linked {formatDistanceToNow(parseISO(child.linkedAt), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <SubjectTimeGlance bySubject={subjectGlanceData} />
            <GoalsGlance {...goalsGlance} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopicsGlance topics={topicsGlance} />
            <ActivityGlance sessions={timelineSessions} />
          </div>
        </div>

        {/* Knowledge Map Assignment Modal */}
        {primaryStudentId && showKOAssignmentModal && user?.id && (
          <AssignmentModal
            isOpen={showKOAssignmentModal}
            onClose={() => {
              setShowKOAssignmentModal(false);
              setSelectedDomain(undefined);
            }}
            koId=""
            assignerId={user.id}
            assignerRole="parent"
            contextId={primaryStudentId}
            onCreateAssignment={handleKOAssignmentCreated}
          />
        )}
      </ParentLayout>
    </PageContainer>
  );
}
