import { callEdgeFunctionGet } from "./common";

export interface ParentSubjectsParams {
  studentId?: string;
}

export type ParentSubjectTrend = "up" | "down" | "stable" | "flat" | "unknown";

export interface ParentSubjectRecord {
  subject: string;
  normalizedSubject?: string;
  masteryPct: number;
  trend: ParentSubjectTrend | string;
  alertFlag: boolean;
  totalSessions: number;
  recentAccuracy: number | null;
  previousAccuracy: number | null;
  lastPracticedAt: string | null;
  recommendedAction?: string | null;
  status?: "review" | "practice" | "maintain" | "advance" | string | null;
  statusLabel?: string;
  statusKey?: string;
}

export interface ParentSubjectsSummary {
  totalSubjects: number;
  averageMastery: number;
  subjectsWithAlerts: number;
}

export interface ParentSubjectsResponse {
  studentId?: string;
  subjects: ParentSubjectRecord[];
  summary: ParentSubjectsSummary | null;
  emptyState: boolean;
  message?: string;
}

// Dev bypass child ID (seeded in database)
const DEV_CHILD_ID = "b2ed7195-4202-405b-85e4-608944a27837";

export async function getParentSubjects(
  params: ParentSubjectsParams = {}
): Promise<ParentSubjectsResponse> {
  const queryParams: Record<string, string> = {};

  // In dev mode without explicit studentId, use the seeded dev child
  const studentId = params.studentId || DEV_CHILD_ID;
  queryParams.childId = studentId;

  return callEdgeFunctionGet<ParentSubjectsResponse>(
    "parent-subjects",
    queryParams
  );
}


