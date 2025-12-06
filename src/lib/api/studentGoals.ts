import { callEdgeFunctionGet } from './common';

export interface StudentGoalQueryParams {
  studentId?: string;
  status?: 'on_track' | 'behind' | 'completed';
}

interface StudentGoalApiRecord {
  id: string;
  student_id: string;
  title: string;
  target_minutes: number;
  progress_minutes: number;
  due_at: string | null;
  status: 'on_track' | 'behind' | 'completed';
  teacher_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentGoalRecord {
  id: string;
  studentId: string;
  title: string;
  targetMinutes: number;
  progressMinutes: number;
  dueAt: string | null;
  status: 'on_track' | 'behind' | 'completed';
  teacherNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentGoalsSummary {
  total: number;
  onTrack: number;
  behind: number;
  completed: number;
}

export interface StudentGoalsResponse {
  goals: StudentGoalRecord[];
  summary: StudentGoalsSummary;
}

interface StudentGoalsApiResponse {
  goals: StudentGoalApiRecord[];
  summary: StudentGoalsSummary;
}

function mapGoal(record: StudentGoalApiRecord): StudentGoalRecord {
  return {
    id: record.id,
    studentId: record.student_id,
    title: record.title,
    targetMinutes: record.target_minutes ?? 0,
    progressMinutes: record.progress_minutes ?? 0,
    dueAt: record.due_at,
    status: record.status,
    teacherNote: record.teacher_note,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function getStudentGoals(
  params: StudentGoalQueryParams = {}
): Promise<StudentGoalsResponse> {
  const query: Record<string, string> = {};

  if (params.studentId) {
    query.studentId = params.studentId;
  }

  if (params.status) {
    query.status = params.status;
  }

  const response = await callEdgeFunctionGet<StudentGoalsApiResponse>(
    'student-goals',
    Object.keys(query).length > 0 ? query : undefined
  );

  return {
    goals: Array.isArray(response.goals)
      ? response.goals.map(mapGoal)
      : [],
    summary: response.summary ?? {
      total: 0,
      onTrack: 0,
      behind: 0,
      completed: 0,
    },
  };
}

