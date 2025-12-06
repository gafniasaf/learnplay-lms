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

export async function getParentSubjects(
  params: ParentSubjectsParams = {}
): Promise<ParentSubjectsResponse> {
  const queryParams: Record<string, string> = {};

  if (params.studentId) {
    queryParams.studentId = params.studentId;
  }

  return callEdgeFunctionGet<ParentSubjectsResponse>(
    "parent-subjects",
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
}


