import { callEdgeFunctionGet } from './common';

export interface StudentTimelineParams {
  studentId?: string;
  limit?: number;
  cursor?: string;
}

interface StudentTimelineApiEvent {
  id: string;
  student_id: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

interface StudentTimelineApiResponse {
  events: StudentTimelineApiEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StudentTimelineEvent {
  id: string;
  studentId: string;
  eventType: string;
  description: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface StudentTimelineResponse {
  events: StudentTimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

function mapEvent(event: StudentTimelineApiEvent): StudentTimelineEvent {
  return {
    id: event.id,
    studentId: event.student_id,
    eventType: event.event_type,
    description: event.description,
    metadata: event.metadata ?? {},
    occurredAt: event.occurred_at,
  };
}

export async function getStudentTimeline(
  params: StudentTimelineParams = {}
): Promise<StudentTimelineResponse> {
  const query: Record<string, string> = {};

  if (params.studentId) {
    query.studentId = params.studentId;
  }

  if (typeof params.limit === 'number') {
    query.limit = String(params.limit);
  }

  if (params.cursor) {
    query.cursor = params.cursor;
  }

  const response = await callEdgeFunctionGet<StudentTimelineApiResponse>(
    'student-timeline',
    Object.keys(query).length > 0 ? query : undefined
  );

  return {
    events: Array.isArray(response.events)
      ? response.events.map(mapEvent)
      : [],
    nextCursor: response.nextCursor ?? null,
    hasMore: Boolean(response.hasMore),
  };
}

