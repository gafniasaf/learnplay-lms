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
  const queryParams: Record<string, string> = {
    studentId: params.studentId,
  };

  if (params.subject) {
    queryParams.subject = params.subject;
  }

  return callEdgeFunctionGet<ParentTopicsResponse>("parent-topics", queryParams);
}
