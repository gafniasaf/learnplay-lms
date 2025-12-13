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
  void window;
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getKpiData() was a mock. Implement parent dashboard KPI via backend and remove this call.");
}

export function getGoalData(): GoalData {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getGoalData() was a mock. Implement goals via backend and remove this call.");
}

export function getSubjectTimeData(window: ParentRangeWindow): SubjectTimeData[] {
  void window;
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getSubjectTimeData() was a mock. Implement subject time via backend and remove this call.");
}

export function getRecentSessions(window: ParentRangeWindow): SessionData[] {
  void window;
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getRecentSessions() was a mock. Implement timeline/sessions via backend and remove this call.");
}

export function getRecentTopics(window: ParentRangeWindow): TopicData[] {
  void window;
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getRecentTopics() was a mock. Implement topics via backend and remove this call.");
}

