import { callEdgeFunctionGet } from "./common";

export interface ParentTimelineParams {
  studentId?: string;
  limit?: number;
}

export interface ParentTimelineEvent {
  id: string;
  eventType: string;
  description: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
}

export interface ParentTimelineResponse {
  events: ParentTimelineEvent[];
  childId: string;
}

export async function getParentTimeline(
  params: ParentTimelineParams = {}
): Promise<ParentTimelineResponse> {
  const queryParams: Record<string, string> = {};

  // Per NO-FALLBACK policy: studentId is required (no seeded defaults).
  const studentId = params.studentId;
  if (!studentId) {
    throw new Error("studentId is required for parent-timeline");
  }
  queryParams.childId = studentId;
  if (typeof params.limit === "number") queryParams.limit = String(params.limit);

  return callEdgeFunctionGet<ParentTimelineResponse>("parent-timeline", queryParams);
}


