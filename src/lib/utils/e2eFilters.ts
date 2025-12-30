export function isE2ECourseId(id: unknown): boolean {
  const s = typeof id === "string" ? id.trim().toLowerCase() : "";
  // E2E course IDs are consistently prefixed in tests (e.g., e2e-publish-*, e2e-studytexts-*).
  return s.startsWith("e2e-") || s.startsWith("e2e_") || s.startsWith("e2e:");
}


