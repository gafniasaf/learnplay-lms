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

export async function getParentGoals(
  params: ParentGoalsParams = {}
): Promise<ParentGoalsResponse> {
  if (!params.studentId) {
    throw new Error("studentId is required - no fallback allowed per IgniteZero rules");
  }
  
  const queryParams: Record<string, string> = {};
  queryParams.childId = params.studentId;

  if (params.status) {
    queryParams.status = params.status;
  }

  return callEdgeFunctionGet<ParentGoalsResponse>("parent-goals", queryParams);
}
