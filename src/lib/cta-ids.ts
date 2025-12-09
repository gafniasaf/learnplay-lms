// ------------------------------------------------------------------
// ⚠️ AUTO-GENERATED FROM docs/mockups/coverage.json
// ------------------------------------------------------------------
// Run: npx tsx scripts/scaffold-ctas.ts

export enum CtaId {
  NAV_ADMIN = "nav-admin",
  NAV_KIDS = "nav-kids",
  NAV_PARENTS = "nav-parents",
  NAV_SCHOOLS = "nav-schools",
}

export type CtaIdType = "nav-admin" | "nav-kids" | "nav-parents" | "nav-schools";

export const CTA_IDS = {
  NAV_ADMIN: "nav-admin",
  NAV_KIDS: "nav-kids",
  NAV_PARENTS: "nav-parents",
  NAV_SCHOOLS: "nav-schools"
} as const;

// Type guard
export function isValidCtaId(id: string): id is CtaIdType {
  return Object.values(CtaId).includes(id as CtaId);
}
