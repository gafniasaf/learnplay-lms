import { addMinutes, parseISO } from "date-fns";
import type { SessionActivity } from "@/components/parent/ActivityTimeline";
import type { ParentTimelineEvent } from "@/lib/api/parentTimeline";

export const humanizeLabel = (value: string): string =>
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const coerceString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

const pickNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
};

export const mapTimelineEventToSession = (
  event: ParentTimelineEvent
): SessionActivity => {
  const metadata = (event.metadata || {}) as Record<string, unknown>;

  const durationMinutes = Math.max(
    pickNumber(
      metadata.time_spent_minutes,
      metadata.durationMinutes,
      metadata.duration_minutes,
      metadata.session_minutes,
      metadata.minutes
    ) ?? 20,
    1
  );

  const subject =
    coerceString(metadata.subject) ||
    coerceString(metadata.courseTitle) ||
    coerceString(metadata.course_name) ||
    (typeof metadata.courseId === "string"
      ? humanizeLabel(metadata.courseId)
      : undefined) ||
    (typeof metadata.course_id === "string"
      ? humanizeLabel(String(metadata.course_id))
      : undefined) ||
    humanizeLabel(event.description || event.eventType);

  const level =
    coerceString(metadata.level) ||
    coerceString(metadata.grade) ||
    coerceString(metadata.course_level) ||
    "All Levels";

  const items = Math.max(
    Math.round(
      pickNumber(
        metadata.items,
        metadata.questions,
        metadata.items_completed,
        metadata.itemsAnswered,
        metadata.itemCount
      ) ?? 0
    ),
    0
  );

  const accuracyCandidate = pickNumber(
    metadata.accuracyPct,
    metadata.accuracy_pct,
    metadata.accuracy
  );

  let accuracyPct =
    accuracyCandidate !== undefined
      ? Math.max(0, Math.min(100, Math.round(accuracyCandidate)))
      : 0;

  if (accuracyPct === 0) {
    const score = pickNumber((metadata as Record<string, unknown>).score);
    const total = pickNumber((metadata as Record<string, unknown>).total);
    if (score !== undefined && total !== undefined && total > 0) {
      accuracyPct = Math.max(
        0,
        Math.min(100, Math.round((score / total) * 100))
      );
    }
  }

  const mistakesCandidate = pickNumber(
    metadata.mistakes,
    metadata.incorrect,
    metadata.errors,
    metadata.missed
  );

  const computedMistakes =
    accuracyPct > 0 && items > 0
      ? Math.max(0, Math.round(items - items * (accuracyPct / 100)))
      : 0;

  const mistakes = Math.max(
    Math.round(mistakesCandidate ?? computedMistakes),
    0
  );

  const mastered =
    Boolean(metadata.mastered) ||
    metadata.status === "mastered" ||
    metadata.state === "mastered" ||
    event.eventType === "badge_earned" ||
    accuracyPct >= 90;

  const explicitEnd =
    coerceString(metadata.endISO) || coerceString(metadata.endTime);

  const startISO = event.occurredAt;
  const endISO = explicitEnd
    ? explicitEnd
    : addMinutes(parseISO(startISO), durationMinutes).toISOString();

  return {
    startISO,
    endISO,
    subject,
    level,
    items,
    accuracyPct,
    mastered,
    mistakes,
  };
};
