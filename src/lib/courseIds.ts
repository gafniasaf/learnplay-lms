export const COURSE_ID_MAX_LENGTH = 64;

/**
 * Course IDs must match backend `idStr` constraints:
 * - 1..64 chars
 * - only letters/numbers/hyphens
 *
 * This helper keeps UI-generated ids compliant so generation doesn't fail with schema errors.
 */
export function slugifyIdPart(input: string): string {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidCourseId(id: string): boolean {
  return /^[a-z0-9-]{1,64}$/i.test(String(id || ""));
}

function randomHex(bytes = 2): string {
  try {
    // Prefer CSPRNG if available (browser / modern runtimes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = typeof crypto !== "undefined" ? crypto : null;
    if (c?.getRandomValues) {
      const arr = new Uint8Array(bytes);
      c.getRandomValues(arr);
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // ignore
  }
  // Fallback: non-crypto randomness
  return Math.random().toString(16).slice(2, 2 + bytes * 2).padEnd(bytes * 2, "0");
}

/**
 * Generate a safe, unique-ish course id from a subject.
 * Output is always <= 64 chars and matches `^[a-z0-9-]+$` (case-insensitive).
 */
export function makeCourseIdFromSubject(subject: string): string {
  const suffix = `${Date.now().toString(36)}${randomHex(2)}`; // ~8 + 4 = 12 chars
  const safeSuffix = slugifyIdPart(suffix).replace(/-/g, "") || Date.now().toString(36);

  const baseRaw = slugifyIdPart(subject);
  const baseFallback = baseRaw || "course";

  const allowedBaseLen = Math.max(1, COURSE_ID_MAX_LENGTH - 1 - safeSuffix.length);
  let base = baseFallback.slice(0, allowedBaseLen).replace(/-+$/g, "");
  if (!base) base = "course";

  const out = `${base}-${safeSuffix}`.slice(0, COURSE_ID_MAX_LENGTH).replace(/-+$/g, "");
  return out || "course";
}

