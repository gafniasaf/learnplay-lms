/**
 * Client-side text sanitization utilities
 * Mirrors server-side validation in supabase/functions/_shared/validation.ts
 */

/**
 * Sanitize text input by removing control characters and angle brackets
 * @param input - Input to sanitize (can be any type, coerced to string)
 * @param max - Maximum length (default 2000)
 * @returns Sanitized string
 */
export function sanitizeText(input: unknown, max = 2000): string {
  let s = (typeof input === "string" ? input : "").slice(0, max);
  // Strip control chars (0x00-0x1F, 0x7F) and angle brackets
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[<>\u0000-\u001F\u007F]/g, "");
  return s;
}

/**
 * Sanitize an object's text fields
 * @param obj - Object with text fields to sanitize
 * @param fields - Array of field names to sanitize
 * @param max - Maximum length per field (default 2000)
 * @returns New object with sanitized fields
 */
export function sanitizeFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
  max = 2000
): T {
  const sanitized = { ...obj };
  for (const field of fields) {
    if (typeof sanitized[field] === "string") {
      sanitized[field] = sanitizeText(sanitized[field], max) as T[typeof field];
    }
  }
  return sanitized;
}
