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

// Dev bypass child ID (seeded in database)
const DEV_CHILD_ID = "b2ed7195-4202-405b-85e4-608944a27837";

export async function getParentTimeline(
  params: ParentTimelineParams = {}
): Promise<ParentTimelineResponse> {
  const queryParams: Record<string, string> = {};

  // In dev mode without explicit studentId, use the seeded dev child
  const studentId = params.studentId || DEV_CHILD_ID;
  queryParams.childId = studentId;

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


