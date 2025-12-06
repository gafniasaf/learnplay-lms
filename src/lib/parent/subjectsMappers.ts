import type { ParentSubjectRecord } from "@/lib/api/parentSubjects";

export const STATUS_LABELS: Record<string, string> = {
  review: "Needs Review",
  practice: "Practice",
  maintain: "Maintain",
  advance: "Advance",
};

export const SUBJECT_WARNINGS: Record<string, string> = {
  review: "Review recommended",
  practice: "Practice focus",
  maintain: "On track",
  advance: "Mastered",
};

export const normalizeSubject = (subject: string): string =>
  subject
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const mapParentSubject = (
  record: ParentSubjectRecord
): ParentSubjectRecord & { normalizedSubject: string; statusLabel: string; statusKey: string } => {
  const normalizedSubject = normalizeSubject(record.subject);
  const statusKey = (record.status ?? record.recommendedAction ?? "").toLowerCase();
  return {
    ...record,
    normalizedSubject,
    statusLabel: STATUS_LABELS[statusKey] ?? "Track",
    statusKey,
  };
};

export type MappedParentSubject = ReturnType<typeof mapParentSubject>;
