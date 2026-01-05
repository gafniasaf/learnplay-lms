import { validateMatterPack } from "../../src/lib/books/bookMatterCore.js";

function formatIssuePath(pathArr) {
  if (!Array.isArray(pathArr) || pathArr.length === 0) return "(root)";
  return pathArr.join(".");
}

/**
 * Validate and return a MatterPack. Throws a single FAIL-LOUD error with the first few issues.
 * @param {unknown} raw
 * @param {{ context?: string }} [opts]
 */
export function requireMatterPack(raw, opts = {}) {
  const v = validateMatterPack(raw);
  if (v.ok) return v.pack;

  const context = typeof opts.context === "string" && opts.context.trim() ? ` (${opts.context.trim()})` : "";
  const issues = v.issues || [];
  const top = issues.slice(0, 8).map((i) => `${i.severity.toUpperCase()}: ${formatIssuePath(i.path)}: ${i.message}`);
  const more = issues.length > top.length ? ` (+${issues.length - top.length} more)` : "";

  throw new Error(`BLOCKED: matter-pack.json validation failed${context}: ${top.join(" | ")}${more}`);
}


