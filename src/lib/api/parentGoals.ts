import { callEdgeFunctionGet } from "./common";

export interface ParentGoalsParams {
  studentId?: string;
  status?: "on_track" | "behind" | "completed";
}

export interface ParentGoalRecord {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  targetMinutes: number;
  progressMinutes: number;
  progressPct: number;
  dueAt: string | null;
  status: "on_track" | "behind" | "completed";
  teacherNote: string | null;
  createdAt: string;
  updatedAt: string;
  daysRemaining: number | null;
  isOverdue: boolean;
}

export interface ParentGoalsSummary {
  totalGoals: number;
  onTrack: number;
  behind: number;
  completed: number;
  overdue: number;
  averageProgress: number;
}

export interface ParentGoalsResponse {
  goals: ParentGoalRecord[];
  byStudent?: Record<string, ParentGoalRecord[]>;
  summary: ParentGoalsSummary | null;
  emptyState: boolean;
  message?: string;
}

// Dev bypass child ID (seeded in database)
const DEV_CHILD_ID = "b2ed7195-4202-405b-85e4-608944a27837";

export async function getParentGoals(
  params: ParentGoalsParams = {}
): Promise<ParentGoalsResponse> {
  const queryParams: Record<string, string> = {};

  // In dev mode without explicit studentId, use the seeded dev child
  const studentId = params.studentId || DEV_CHILD_ID;
  queryParams.childId = studentId;

  if (params.status) {
    queryParams.status = params.status;
  }

  return callEdgeFunctionGet<ParentGoalsResponse>("parent-goals", queryParams);
}
