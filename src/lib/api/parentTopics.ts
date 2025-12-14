import { callEdgeFunctionGet } from "./common";

export interface ParentTopicsParams {
  studentId: string;
  subject?: string;
}

export type ParentTopicAction = "review" | "practice" | "maintain" | "advance";

export interface ParentTopicRecord {
  topic: string;
  subject: string;
  accuracyPct: number;
  attempts: number;
  correctCount: number;
  lastPracticedAt: string | null;
  recommendedAction: ParentTopicAction;
  actionMessage: string;
}

export interface ParentTopicsSummary {
  totalTopics: number;
  averageAccuracy: number;
  topicsNeedingReview: number;
  topicsForPractice: number;
  topicsMastered: number;
}

export interface ParentTopicsResponse {
  studentId: string;
  topics: ParentTopicRecord[];
  summary: ParentTopicsSummary | null;
  emptyState: boolean;
  message?: string | null;
}

export async function getParentTopics(
  params: ParentTopicsParams
): Promise<ParentTopicsResponse> {
  if (!params.studentId) {
    throw new Error("studentId is required - no fallback allowed per IgniteZero rules");
  }
  
  const queryParams: Record<string, string> = {
    childId: params.studentId,
  };

  if (params.subject) {
    queryParams.subject = params.subject;
  }

  return callEdgeFunctionGet<ParentTopicsResponse>("parent-topics", queryParams);
}
