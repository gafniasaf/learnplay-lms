import { callEdgeFunctionGet } from "./common";

export interface ParentTimelineParams {
  studentId?: string;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  limit?: number;
  cursor?: string;
}

export interface ParentTimelineEvent {
  id: string;
  studentId: string;
  studentName: string;
  eventType: string;
  description: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface ParentTimelineResponse {
  events: ParentTimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  summary?: {
    totalEvents: number;
    eventTypes: Record<string, number>;
    dateRange: {
      start: string | null;
      end: string | null;
    };
  };
  emptyState?: boolean;
  message?: string;
}

export async function getParentTimeline(
  params: ParentTimelineParams = {}
): Promise<ParentTimelineResponse> {
  if (!params.studentId) {
    throw new Error("studentId is required - no fallback allowed per IgniteZero rules");
  }
  
  const queryParams: Record<string, string> = {};
  queryParams.childId = params.studentId;

  if (params.startDate) {
    queryParams.startDate = params.startDate;
  }
  if (params.endDate) {
    queryParams.endDate = params.endDate;
  }
  if (params.eventType) {
    queryParams.eventType = params.eventType;
  }
  if (typeof params.limit === "number") {
    queryParams.limit = String(params.limit);
  }
  if (params.cursor) {
    queryParams.cursor = params.cursor;
  }

  return callEdgeFunctionGet<ParentTimelineResponse>("parent-timeline", queryParams);
}


