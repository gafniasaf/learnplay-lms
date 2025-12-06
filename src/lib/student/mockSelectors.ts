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
  return {
    activeMinutes: 45,
    itemsCompleted: 12,
    accuracyPct: 87,
    streakDays: 5,
    sparkline: [38, 42, 40, 43, 41, 44, 45],
    deltaVsLastWeek: 12,
  };
}

export function getAssignmentsDue(_window: ParentRangeWindow): StudentAssignment[] {
  return [
    { id: 'a1', title: 'Fractions Practice', subject: 'Math', dueISO: new Date(Date.now() + 3600*1000).toISOString(), priority: 'high' },
    { id: 'a2', title: 'Plants Worksheet', subject: 'Science', dueISO: new Date(Date.now() + 24*3600*1000).toISOString(), priority: 'medium' },
  ];
}

export function getRecentStudentSessions(_window: ParentRangeWindow): StudentSession[] {
  const now = Date.now();
  return [
    { startISO: new Date(now - 60*60*1000).toISOString(), endISO: new Date(now - 30*60*1000).toISOString(), subject: 'Math', items: 12, accuracyPct: 92 },
    { startISO: new Date(now - 3*60*60*1000).toISOString(), endISO: new Date(now - 2.5*60*60*1000).toISOString(), subject: 'Reading', items: 8, accuracyPct: 88 },
  ];
}

export function getStudentGoals(): StudentGoalData {
  return { goalMinutes: 200, actualMinutes: 90, goalItems: 80, actualItems: 34 };
}

export function getStudentAchievements(_window: ParentRangeWindow): StudentAchievement[] {
  return [
    { id: 'ach1', name: 'Streak x3', earnedISO: new Date().toISOString() },
    { id: 'ach2', name: 'Accuracy 90%', earnedISO: new Date(Date.now() - 86400000).toISOString() },
    { id: 'ach3', name: 'First 100 Items', earnedISO: new Date(Date.now() - 2*86400000).toISOString() },
  ];
}

export function getContinuePoint(): ContinuePoint {
  return { courseId: 'math-fractions', level: 2, title: 'Math • Fractions' };
}


