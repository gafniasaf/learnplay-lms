import { mapStudentTimelineEventToSession } from '@/lib/student/timelineMappers';
import type { StudentTimelineEvent } from '@/lib/api/studentTimeline';

describe('mapStudentTimelineEventToSession', () => {
  it('creates a student session using metadata overrides', () => {
    const event: StudentTimelineEvent = {
      id: 'evt-1',
      studentId: 'student-1',
      eventType: 'practice',
      description: 'Fractions practice',
      occurredAt: '2025-10-30T10:00:00.000Z',
      metadata: {
        subject: 'Math',
        startISO: '2025-10-30T10:00:00.000Z',
        endISO: '2025-10-30T10:25:00.000Z',
        items: 18,
        accuracy_pct: 85,
      },
    };

    const session = mapStudentTimelineEventToSession(event);

    expect(session).toEqual({
      startISO: '2025-10-30T10:00:00.000Z',
      endISO: '2025-10-30T10:25:00.000Z',
      subject: 'Math',
      items: 18,
      accuracyPct: 85,
    });
  });

  it('falls back to occurredAt and duration when metadata is incomplete', () => {
    const event: StudentTimelineEvent = {
      id: 'evt-2',
      studentId: 'student-1',
      eventType: 'practice',
      description: 'Reading practice',
      occurredAt: '2025-10-31T14:00:00.000Z',
      metadata: {
        duration_minutes: 30,
        item_count: 10,
        accuracyPct: 92,
      },
    };

    const session = mapStudentTimelineEventToSession(event);

    expect(session.startISO).toBe('2025-10-31T14:00:00.000Z');
    expect(session.endISO).toBe('2025-10-31T14:30:00.000Z');
    expect(session.subject).toBe('Reading practice');
    expect(session.items).toBe(10);
    expect(session.accuracyPct).toBe(92);
  });
});

