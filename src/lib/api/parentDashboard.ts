import { callEdgeFunctionGet } from "./common";

export interface ParentDashboardParams {
  parentId?: string;
}

export interface ParentDashboardChildAssignment {
  id: string;
  title: string;
  courseId: string;
  dueAt: string;
  status: string;
  progressPct: number;
}

export interface ParentDashboardChild {
  studentId: string;
  studentName: string;
  linkStatus: string;
  linkedAt: string;
  metrics: {
    streakDays: number;
    xpTotal: number;
    lastLoginAt: string | null;
    recentActivityCount: number;
  };
  upcomingAssignments: {
    count: number;
    items: ParentDashboardChildAssignment[];
  };
  alerts: {
    overdueAssignments: number;
    goalsBehind: number;
    needsAttention: boolean;
  };
}

export interface ParentDashboardSummary {
  totalChildren: number;
  totalAlerts: number;
  averageStreak: number;
  totalXp: number;
}

export interface ParentDashboardResponse {
  parentId: string;
  parentName?: string;
  summary: ParentDashboardSummary;
  children: ParentDashboardChild[];
}

export async function getParentDashboard(
  params: ParentDashboardParams = {}
): Promise<ParentDashboardResponse> {
  const queryParams: Record<string, string> = {};

  if (params.parentId) {
    queryParams.parentId = params.parentId;
  }

  return callEdgeFunctionGet<ParentDashboardResponse>(
    "parent-dashboard",
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
}
