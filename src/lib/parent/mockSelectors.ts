import type { ParentRangeWindow } from '@/hooks/useParentRange';

export interface KpiData {
  activeMinutes: number;
  itemsCompleted: number;
  accuracyPct: number;
  streakDays: number;
  sparkline: number[]; // 7 days of values
  deltaVsLastWeek: number; // percentage change
}

export interface GoalData {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export interface SubjectTimeData {
  subject: string;
  minutes: number;
  color: string;
}

export interface SessionData {
  startISO: string;
  endISO: string;
  subject: string;
  level: string;
  items: number;
  accuracyPct: number;
  mastered: boolean;
  mistakes: number;
}

export interface TopicData {
  date: string;
  subject: string;
  topic: string;
  minutes: number;
  items: number;
  accuracyPct: number;
  status: 'New' | 'Practicing' | 'Mastered';
}

// Mock selectors (to be replaced with real data later)
export function getKpiData(window: ParentRangeWindow): KpiData {
  // Mock data for now
  return {
    activeMinutes: 45,
    itemsCompleted: 23,
    accuracyPct: 87,
    streakDays: 5,
    sparkline: [30, 35, 42, 38, 45, 40, 45],
    deltaVsLastWeek: 12,
  };
}

export function getGoalData(): GoalData {
  return {
    goalMinutes: 60,
    actualMinutes: 45,
    goalItems: 50,
    actualItems: 23,
  };
}

export function getSubjectTimeData(window: ParentRangeWindow): SubjectTimeData[] {
  return [
    { subject: 'Math', minutes: 20, color: 'hsl(var(--chart-1))' },
    { subject: 'Science', minutes: 15, color: 'hsl(var(--chart-2))' },
    { subject: 'English', minutes: 10, color: 'hsl(var(--chart-3))' },
  ];
}

export function getRecentSessions(window: ParentRangeWindow): SessionData[] {
  const now = new Date();
  return [
    {
      startISO: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      endISO: new Date(now.getTime() - 1.5 * 60 * 60 * 1000).toISOString(),
      subject: 'Math',
      level: 'Level 2',
      items: 12,
      accuracyPct: 92,
      mastered: true,
      mistakes: 1,
    },
    {
      startISO: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      endISO: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      subject: 'Science',
      level: 'Level 1',
      items: 10,
      accuracyPct: 80,
      mastered: false,
      mistakes: 2,
    },
  ];
}

export function getRecentTopics(window: ParentRangeWindow): TopicData[] {
  return [
    {
      date: new Date().toISOString().split('T')[0],
      subject: 'Math',
      topic: 'Fractions',
      minutes: 15,
      items: 10,
      accuracyPct: 90,
      status: 'Practicing',
    },
    {
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subject: 'Science',
      topic: 'Plants',
      minutes: 12,
      items: 8,
      accuracyPct: 85,
      status: 'New',
    },
    {
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subject: 'English',
      topic: 'Verbs',
      minutes: 10,
      items: 12,
      accuracyPct: 95,
      status: 'Mastered',
    },
  ];
}

