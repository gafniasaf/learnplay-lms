// ------------------------------------------------------------------
// ⚠️ AUTO-GENERATED FROM docs/mockups/coverage.json
// ------------------------------------------------------------------
// Run: npx tsx scripts/scaffold-ctas.ts

export enum CtaId {
  CTA_ADD_STUDENT = "cta-add-student",
  CTA_CREATE_CLASS = "cta-create-class",
  CTA_GENERATE_CLASS_CODE = "cta-generate-class-code",
  CTA_JOIN_CLASS = "cta-join-class",
  CTA_LINK_CHILD = "cta-link-child",
  CTA_REMOVE_STUDENT = "cta-remove-student",
  CTA_UPDATE_GOAL = "cta-update-goal",
  CTA_VIEW_ACHIEVEMENT = "cta-view-achievement",
  CTA_VIEW_CHILD_GOALS = "cta-view-child-goals",
  CTA_VIEW_CHILD_PROGRESS = "cta-view-child-progress",
  CTA_VIEW_TIMELINE_EVENT = "cta-view-timeline-event",
  NAV_ADMIN = "nav-admin",
  NAV_KIDS = "nav-kids",
  NAV_PARENTS = "nav-parents",
  NAV_SCHOOLS = "nav-schools",
}

export type CtaIdType = "cta-add-student" | "cta-create-class" | "cta-generate-class-code" | "cta-join-class" | "cta-link-child" | "cta-remove-student" | "cta-update-goal" | "cta-view-achievement" | "cta-view-child-goals" | "cta-view-child-progress" | "cta-view-timeline-event" | "nav-admin" | "nav-kids" | "nav-parents" | "nav-schools";

export const CTA_IDS = {
  CTA_ADD_STUDENT: "cta-add-student",
  CTA_CREATE_CLASS: "cta-create-class",
  CTA_GENERATE_CLASS_CODE: "cta-generate-class-code",
  CTA_JOIN_CLASS: "cta-join-class",
  CTA_LINK_CHILD: "cta-link-child",
  CTA_REMOVE_STUDENT: "cta-remove-student",
  CTA_UPDATE_GOAL: "cta-update-goal",
  CTA_VIEW_ACHIEVEMENT: "cta-view-achievement",
  CTA_VIEW_CHILD_GOALS: "cta-view-child-goals",
  CTA_VIEW_CHILD_PROGRESS: "cta-view-child-progress",
  CTA_VIEW_TIMELINE_EVENT: "cta-view-timeline-event",
  NAV_ADMIN: "nav-admin",
  NAV_KIDS: "nav-kids",
  NAV_PARENTS: "nav-parents",
  NAV_SCHOOLS: "nav-schools"
} as const;

// Type guard
export function isValidCtaId(id: string): id is CtaIdType {
  return Object.values(CtaId).includes(id as CtaId);
}
