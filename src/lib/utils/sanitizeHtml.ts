import DOMPurify from "dompurify";

/**
 * Centralized HTML sanitizer for any rich-text coming from:
 * - course JSON (stem/explanation/option HTML)
 * - AI providers
 * - user-authored HTML in the editor
 *
 * This enforces a conservative allow‑list of tags/attributes suitable
 * for educational content while stripping scripts, inline handlers,
 * and other potentially dangerous markup.
 */
const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "img",
] as const;

const ALLOWED_ATTR = ["href", "src", "alt", "title", "class"] as const;

export function sanitizeHtml(html: unknown): string {
  const input = typeof html === "string" ? html : String(html ?? "");
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ALLOWED_TAGS as unknown as string[],
    ALLOWED_ATTR: ALLOWED_ATTR as unknown as string[],
  });
}


