/**
 * Student-facing UI types.
 *
 * These are lightweight view-model shapes used by student dashboard components.
 * Live data should be mapped into these shapes via hooks/mappers (no mock selectors).
 */

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


