import { useState, useMemo } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { UserPlus, Mail } from "lucide-react";
import { ChildHeader } from "@/components/parent/ChildHeader";
import { KpiCard } from "@/components/parent/KpiCard";
import { GoalProgressCard } from "@/components/parent/GoalProgressCard";
import { SubjectTimeCard } from "@/components/parent/SubjectTimeCard";
import { RecentActivityCard } from "@/components/parent/RecentActivityCard";
import { RecentTopicsCard } from "@/components/parent/RecentTopicsCard";
import type { SessionActivity } from "@/components/parent/ActivityTimeline";
import type { TopicRow } from "@/components/parent/TopicsHandled";

const Parents = () => {
  const navigate = useNavigate();
  const { dashboard, loading, error } = useDashboard("parent");
  const [searchParams, setSearchParams] = useSearchParams();
  
  const range = (searchParams.get("range") as "day" | "week" | "month") || "week";
  const [selectedChildId, setSelectedChildId] = useState("child-1");

  const handleRangeChange = (newRange: "day" | "week" | "month") => {
    setSearchParams({ range: newRange });
  };

  // Mock children data
  const mockChildren = [
    { id: "child-1", name: "Emma", grade: "Grade 4" },
    { id: "child-2", name: "Liam", grade: "Grade 2" },
  ];

  // Mock KPI data with sparklines
  const mockKpiData = useMemo(() => ({
    day: {
      minutes: { value: 45, sparkline: [38, 42, 40, 43, 41, 44, 45], wowDelta: 12 },
      items: { value: 12, sparkline: [10, 11, 9, 12, 10, 11, 12], wowDelta: 9 },
      accuracy: { value: "87%", sparkline: [85, 84, 86, 88, 87, 86, 87], wowDelta: 2 },
      streak: { value: 5, sparkline: [1, 2, 3, 4, 5, 5, 5], wowDelta: 0 },
    },
    week: {
      minutes: { value: 180, sparkline: [160, 165, 170, 175, 178, 180, 180], wowDelta: 15 },
      items: { value: 58, sparkline: [50, 52, 54, 55, 56, 57, 58], wowDelta: 12 },
      accuracy: { value: "89%", sparkline: [85, 86, 87, 88, 88, 89, 89], wowDelta: 4 },
      streak: { value: 5, sparkline: [1, 2, 3, 4, 5, 5, 5], wowDelta: 0 },
    },
    month: {
      minutes: { value: 720, sparkline: [650, 670, 680, 690, 700, 710, 720], wowDelta: 8 },
      items: { value: 245, sparkline: [220, 225, 230, 235, 238, 242, 245], wowDelta: 6 },
      accuracy: { value: "88%", sparkline: [85, 86, 86, 87, 87, 88, 88], wowDelta: 3 },
      streak: { value: 5, sparkline: [1, 2, 3, 4, 5, 5, 5], wowDelta: 0 },
    },
  }), []);

  const currentKpi = mockKpiData[range];

  const mockSubjectTime = [
    { subject: "Math", minutes: 85, change: 12 },
    { subject: "Reading", minutes: 65, change: -5 },
    { subject: "Science", minutes: 30, change: 15 },
  ];

  const mockTopics: TopicRow[] = [
    {
      date: new Date().toISOString(),
      subject: "Math",
      topic: "Multiplication Tables (6-9)",
      minutes: 15,
      items: 12,
      accuracyPct: 92,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 86400000).toISOString(),
      subject: "Reading",
      topic: "Vocabulary - Context Clues",
      minutes: 18,
      items: 10,
      accuracyPct: 94,
      status: "Mastered",
    },
    {
      date: new Date(Date.now() - 172800000).toISOString(),
      subject: "Science",
      topic: "Water Cycle Stages",
      minutes: 22,
      items: 8,
      accuracyPct: 88,
      status: "Practicing",
    },
  ];

  const mockTopicsDaily: TopicRow[] = [
    {
      date: new Date().toISOString(),
      subject: "Math",
      topic: "Multiplication Tables (6-9)",
      minutes: 15,
      items: 12,
      accuracyPct: 92,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 3600000).toISOString(),
      subject: "Reading",
      topic: "Reading Comprehension - Fiction",
      minutes: 20,
      items: 8,
      accuracyPct: 87,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 7200000).toISOString(),
      subject: "Science",
      topic: "Solar System - Planet Order",
      minutes: 10,
      items: 5,
      accuracyPct: 100,
      status: "Mastered",
    },
  ];

  const mockTopicsWeekly: TopicRow[] = [
    {
      date: new Date().toISOString(),
      subject: "Math",
      topic: "Multiplication Tables (6-9)",
      minutes: 15,
      items: 12,
      accuracyPct: 92,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 86400000).toISOString(),
      subject: "Math",
      topic: "Division with Remainders",
      minutes: 25,
      items: 15,
      accuracyPct: 85,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 86400000).toISOString(),
      subject: "Reading",
      topic: "Vocabulary - Context Clues",
      minutes: 18,
      items: 10,
      accuracyPct: 94,
      status: "Mastered",
    },
    {
      date: new Date(Date.now() - 172800000).toISOString(),
      subject: "Science",
      topic: "Water Cycle Stages",
      minutes: 22,
      items: 8,
      accuracyPct: 88,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 259200000).toISOString(),
      subject: "Math",
      topic: "Fractions - Introduction",
      minutes: 30,
      items: 20,
      accuracyPct: 78,
      status: "New",
    },
    {
      date: new Date(Date.now() - 345600000).toISOString(),
      subject: "Reading",
      topic: "Story Elements - Plot",
      minutes: 15,
      items: 6,
      accuracyPct: 91,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 432000000).toISOString(),
      subject: "Science",
      topic: "Animal Habitats",
      minutes: 20,
      items: 9,
      accuracyPct: 89,
      status: "Mastered",
    },
  ];

  const mockTopicsMonthly: TopicRow[] = [
    ...mockTopicsWeekly,
    {
      date: new Date(Date.now() - 604800000).toISOString(),
      subject: "Math",
      topic: "Addition & Subtraction Review",
      minutes: 45,
      items: 35,
      accuracyPct: 96,
      status: "Mastered",
    },
    {
      date: new Date(Date.now() - 1209600000).toISOString(),
      subject: "Science",
      topic: "Plant Life Cycle",
      minutes: 28,
      items: 12,
      accuracyPct: 89,
      status: "Mastered",
    },
    {
      date: new Date(Date.now() - 1814400000).toISOString(),
      subject: "Reading",
      topic: "Main Idea & Supporting Details",
      minutes: 32,
      items: 14,
      accuracyPct: 93,
      status: "Mastered",
    },
    {
      date: new Date(Date.now() - 2419200000).toISOString(),
      subject: "Math",
      topic: "Place Value - Thousands",
      minutes: 38,
      items: 25,
      accuracyPct: 87,
      status: "Practicing",
    },
    {
      date: new Date(Date.now() - 2592000000).toISOString(),
      subject: "Science",
      topic: "States of Matter",
      minutes: 35,
      items: 18,
      accuracyPct: 92,
      status: "Mastered",
    },
  ];

  const mockActivities: SessionActivity[] = [
    {
      startISO: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      endISO: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      subject: "Math",
      level: "Grade 4",
      items: 12,
      accuracyPct: 92,
      mastered: false,
      mistakes: 1,
    },
    {
      startISO: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
      endISO: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
      subject: "Reading",
      level: "Level 3",
      items: 8,
      accuracyPct: 100,
      mastered: true,
      mistakes: 0,
    },
    {
      startISO: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      endISO: new Date(Date.now() - 1000 * 60 * 225).toISOString(),
      subject: "Science",
      level: "Elementary",
      items: 6,
      accuracyPct: 83,
      mastered: false,
      mistakes: 1,
    },
    {
      startISO: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
      endISO: new Date(Date.now() - 1000 * 60 * 298).toISOString(),
      subject: "Math",
      level: "Grade 3",
      items: 15,
      accuracyPct: 87,
      mastered: false,
      mistakes: 2,
    },
  ];

  const mockGoals = {
    goalMinutes: 200,
    actualMinutes: 180,
    goalItems: 80,
    actualItems: 70,
  };

  // Compute status (on track if >= 80% of both goals)
  const minutesProgress = (mockGoals.actualMinutes / mockGoals.goalMinutes) * 100;
  const itemsProgress = (mockGoals.actualItems / mockGoals.goalItems) * 100;
  const statusOnTrack = minutesProgress >= 80 && itemsProgress >= 80;

  if (loading) {
    return (
      <PageContainer>
        <ParentLayout>
          <div className="space-y-6">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6">
              <Skeleton className="h-12 w-48" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-8 w-24" />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          </div>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ParentLayout>
          <div className="text-center py-12">
            <p className="text-destructive mb-4">Failed to load parent dashboard</p>
            <Button onClick={() => window.location.reload()}>
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
          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/messages")}>
              <Mail className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Messages</span>
            </Button>
            <Button size="sm" onClick={() => navigate("/parent/link-child")}>
              <UserPlus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Link Child</span>
            </Button>
          </div>

          {/* Compact Hero Header */}
          <ChildHeader
            children={mockChildren}
            selectedChildId={selectedChildId}
            onChildChange={setSelectedChildId}
            range={range}
            onRangeChange={handleRangeChange}
            statusOnTrack={statusOnTrack}
          />

          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Active Minutes"
              value={currentKpi.minutes.value}
              sparkline={currentKpi.minutes.sparkline}
              deltaVsLastWeek={currentKpi.minutes.wowDelta}
              tooltip="Total time spent on learning activities"
            />
            <KpiCard
              title="Items Answered"
              value={currentKpi.items.value}
              sparkline={currentKpi.items.sparkline}
              deltaVsLastWeek={currentKpi.items.wowDelta}
              tooltip="Number of practice items completed"
            />
            <KpiCard
              title="Accuracy"
              value={currentKpi.accuracy.value}
              sparkline={currentKpi.accuracy.sparkline}
              deltaVsLastWeek={currentKpi.accuracy.wowDelta}
              tooltip="Overall correctness percentage"
            />
            <KpiCard
              title="Streak"
              value={`${currentKpi.streak.value} days`}
              sparkline={currentKpi.streak.sparkline}
              deltaVsLastWeek={currentKpi.streak.wowDelta}
              tooltip="Consecutive days with activity"
            />
          </div>

          {/* Row 2: Goals & Subjects */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GoalProgressCard {...mockGoals} />
            <SubjectTimeCard subjects={mockSubjectTime} />
          </div>

          {/* Row 3: Recent Activity & Topics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentActivityCard sessions={mockActivities} />
            <RecentTopicsCard topics={mockTopics} />
          </div>
        </div>
      </ParentLayout>
    </PageContainer>
  );
};

export default Parents;
