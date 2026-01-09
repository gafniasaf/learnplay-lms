import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function requireSupabaseUrl(): string {
  const a = process.env.SUPABASE_URL?.trim();
  if (a) return a.replace(/\/$/, "");
  const b = process.env.VITE_SUPABASE_URL?.trim();
  if (b) return b.replace(/\/$/, "");
  console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
  process.exit(1);
}

function requireId(name: string, raw: unknown): string {
  const v = String(raw || "").trim();
  if (!v) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v;
}

function normalizeWs(s: string): string {
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBoldTerms(raw: string): string[] {
  const s = String(raw || "");
  const out: string[] = [];
  const re = /<<\s*BOLD_START\s*>>([\s\S]*?)<<\s*BOLD_END\s*>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const t0 = normalizeWs(String(m[1] || ""));
    if (!t0) continue;
    const t = t0
      .replace(/^[\s,.;:!?()\[\]«»"']+/, "")
      .replace(/[\s,.;:!?()\[\]«»"']+$/, "")
      .trim();
    if (!t) continue;
    out.push(t);
  }
  return out;
}

function extractStrongTerms(raw: string): string[] {
  const s = String(raw || "");
  const out: string[] = [];
  const re = /<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const innerRaw = String(m[2] || "");
    const inner = normalizeWs(innerRaw.replace(/<[^>]+>/g, " "));
    if (!inner) continue;
    const t = inner
      .replace(/^[\s,.;:!?()\[\]«»"']+/, "")
      .replace(/[\s,.;:!?()\[\]«»"']+$/, "")
      .trim();
    if (!t) continue;
    out.push(t);
  }
  return out;
}

function walkJson(value: unknown, visitor: (s: string) => void) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) walkJson(v, visitor);
    return;
  }
  if (typeof value === "string") {
    visitor(value);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) walkJson(v, visitor);
  }
}

async function main() {
  const bookId = requireId("bookId", process.argv[2]);
  const bookVersionId = requireId("bookVersionId", process.argv[3]);

  const SUPABASE_URL = requireSupabaseUrl();
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: ver, error: verErr } = await supabase
    .from("book_versions")
    .select("canonical_path, compiled_canonical_path, authoring_mode")
    .eq("book_id", bookId)
    .eq("book_version_id", bookVersionId)
    .single();
  if (verErr || !ver) throw new Error(verErr?.message || "BLOCKED: book version not found");

  const mode = typeof (ver as any).authoring_mode === "string" ? String((ver as any).authoring_mode) : "legacy";
  const compiled = typeof (ver as any).compiled_canonical_path === "string" ? String((ver as any).compiled_canonical_path).trim() : "";
  const canonicalDb = typeof (ver as any).canonical_path === "string" ? String((ver as any).canonical_path).trim() : "";
  const canonicalPath = mode === "skeleton" && compiled ? compiled : canonicalDb;
  if (!canonicalPath) throw new Error("BLOCKED: canonical_path is missing");

  const { data: blob, error: dlErr } = await supabase.storage.from("books").download(canonicalPath);
  if (dlErr || !blob) throw new Error(dlErr?.message || `BLOCKED: failed to download books/${canonicalPath}`);

  const canonical = JSON.parse(await blob.text());

  const freq = new Map<string, { term: string; count: number }>();
  walkJson(canonical, (s) => {
    for (const t of [...extractBoldTerms(s), ...extractStrongTerms(s)]) {
      const term = normalizeWs(t);
      if (!term) continue;
      const key = term.toLowerCase();
      const prev = freq.get(key);
      if (!prev) freq.set(key, { term, count: 1 });
      else prev.count += 1;
    }
  });

  const candidates = Array.from(freq.values())
    .sort((a, b) => b.count - a.count)
    .map((x) => x.term);

  if (candidates.length < 50) {
    throw new Error("BLOCKED: not enough emphasized terms to build index (need >= 50 terms)");
  }

  const entries = candidates
    .slice(0, 600)
    .map((term) => ({ term }))
    .sort((a, b) => a.term.localeCompare(b.term, "nl"));

  const out = {
    schemaVersion: "index_v1",
    bookId,
    bookVersionId,
    language: typeof canonical?.meta?.language === "string" ? canonical.meta.language : "nl",
    generatedAt: new Date().toISOString(),
    entries,
  };

  const outPath = `books/${bookId}/${bookVersionId}/matter/index.generated.json`;
  const text = JSON.stringify(out, null, 2);
  const blobOut = new Blob([text], { type: "application/json" });
  const up = await supabase.storage.from("books").upload(outPath, blobOut, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "no-cache",
  });
  if (up.error) throw new Error(up.error.message);

  console.log(JSON.stringify({ ok: true, outPath, entries: entries.length }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ generate-index-deterministic failed: ${msg}`);
  process.exit(1);
});


