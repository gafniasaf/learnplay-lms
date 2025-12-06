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

// Dev bypass parent ID (seeded in database)
const DEV_PARENT_ID = "613d43cb-0922-4fad-b528-dbed8d2a5c79";

export async function getParentDashboard(
  params: ParentDashboardParams = {}
): Promise<ParentDashboardResponse> {
  const queryParams: Record<string, string> = {};

  // In dev mode without explicit parentId, use the seeded dev parent
  const parentId = params.parentId || DEV_PARENT_ID;
  queryParams.parentId = parentId;

  return callEdgeFunctionGet<ParentDashboardResponse>(
    "parent-dashboard",
    queryParams
  );
}
