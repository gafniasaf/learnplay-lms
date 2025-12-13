import type { ParentRangeWindow } from '@/hooks/useParentRange';

export interface StudentKpiData {
  activeMinutes: number;
  itemsCompleted: number;
  accuracyPct: number;
  streakDays: number;
  sparkline: number[];
  deltaVsLastWeek: number;
}

export interface StudentAssignment {
  id: string;
  title: string;
  subject: string;
  dueISO: string;
  priority: 'high' | 'medium' | 'low';
}

export interface StudentSession {
  startISO: string;
  endISO: string;
  subject: string;
  items: number;
  accuracyPct: number;
}

export interface StudentGoalData {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

export interface StudentAchievement {
  id: string;
  name: string;
  earnedISO: string;
}

export interface ContinuePoint {
  courseId: string;
  level: number;
  title: string;
}

export function getStudentKpiData(_window: ParentRangeWindow): StudentKpiData {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getStudentKpiData() was a mock. Implement a real data source (dashboard/analytics edge functions) and remove this call.");
}

export function getAssignmentsDue(_window: ParentRangeWindow): StudentAssignment[] {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getAssignmentsDue() was a mock. Implement student assignments via backend and remove this call.");
}

export function getRecentStudentSessions(_window: ParentRangeWindow): StudentSession[] {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getRecentStudentSessions() was a mock. Implement session history via backend and remove this call.");
}

export function getStudentGoals(): StudentGoalData {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getStudentGoals() was a mock. Implement goals via backend and remove this call.");
}

export function getStudentAchievements(_window: ParentRangeWindow): StudentAchievement[] {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getStudentAchievements() was a mock. Implement achievements via backend and remove this call.");
}

export function getContinuePoint(): ContinuePoint {
  throw new Error("❌ MOCK SELECTORS FORBIDDEN: getContinuePoint() was a mock. Implement continue point via backend and remove this call.");
}


