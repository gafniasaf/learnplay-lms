import type { StudentTimelineEvent } from '@/lib/api/studentTimeline';
import type { StudentSession } from '@/lib/student/mockSelectors';

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const resolveString = (value: unknown, fallback = ''): string => {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
};

const minutesToMs = (minutes: number) => minutes * 60_000;

export function mapStudentTimelineEventToSession(
  event: StudentTimelineEvent
): StudentSession {
  const metadata = event.metadata ?? {};

  const subject = resolveString(
    (metadata as Record<string, unknown>).subject,
    event.description || 'Learning Session'
  );

  const startISO = resolveString(
    (metadata as Record<string, unknown>).startISO ?? (metadata as Record<string, unknown>).start_at,
    event.occurredAt
  );

  const durationMinutes = toNumber(
    (metadata as Record<string, unknown>).duration_minutes ?? (metadata as Record<string, unknown>).durationMinutes,
    0
  );

  const endISO = resolveString(
    (metadata as Record<string, unknown>).endISO ?? (metadata as Record<string, unknown>).end_at,
    durationMinutes > 0
      ? new Date(new Date(startISO).getTime() + minutesToMs(durationMinutes)).toISOString()
      : startISO
  );

  const items = Math.max(
    toNumber(
      (metadata as Record<string, unknown>).items ??
        (metadata as Record<string, unknown>).item_count ??
        (metadata as Record<string, unknown>).questions,
      0
    ),
    0
  );

  const accuracyPct = Math.min(
    Math.max(
      toNumber(
        (metadata as Record<string, unknown>).accuracy_pct ?? (metadata as Record<string, unknown>).accuracyPct,
        0
      ),
      0
    ),
    100
  );

  return {
    startISO,
    endISO,
    subject,
    items,
    accuracyPct,
  };
}

