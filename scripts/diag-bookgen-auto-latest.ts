import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

// Load env from local files (gitignored) without printing secret values.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    process.exit(1);
  }
  return v.trim();
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function countSkeletonImages(skeleton: any): { total: number; withPrompt: number } {
  let total = 0;
  let withPrompt = 0;

  const walkBlocks = (blocksRaw: any[]) => {
    const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const type = typeof (b as any).type === "string" ? (b as any).type : "";
      if (type === "subparagraph") {
        walkBlocks(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
        continue;
      }

      const images = Array.isArray((b as any).images) ? (b as any).images : [];
      for (const img of images) {
        const src = typeof img?.src === "string" ? img.src.trim() : "";
        if (!src) continue;
        total += 1;
        const p = typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt.trim() : "";
        if (p) withPrompt += 1;
      }
    }
  };

  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters : [];
  for (const ch of chapters) {
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      walkBlocks(Array.isArray(s?.blocks) ? s.blocks : []);
    }
  }

  return { total, withPrompt };
}

async function main() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const SUPABASE_ANON_KEY =
    getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: jobs, error } = await admin
    .from("ai_agent_jobs")
    .select("id, job_type, status, created_at, started_at, completed_at, payload, result, error")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("job_type", "book_generate_full")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(`Failed to query ai_agent_jobs: ${error.message}`);
  }

  const rows = Array.isArray(jobs) ? jobs : [];
  if (rows.length === 0) {
    console.log("[diag-bookgen-auto] No recent book_generate_full jobs found for this org.");
    return;
  }

  console.log(`[diag-bookgen-auto] Recent book_generate_full jobs (org=${ORGANIZATION_ID}):`);
  for (const j of rows) {
    const payload = j?.payload && typeof j.payload === "object" ? (j.payload as any) : {};
    const result = j?.result && typeof j.result === "object" ? (j.result as any) : {};
    const bookId = typeof payload.bookId === "string" ? payload.bookId : "";
    if (!bookId.startsWith("e2e-bookgen-auto-")) continue;
    console.log({
      id: j.id,
      status: j.status,
      created_at: j.created_at,
      started_at: j.started_at,
      completed_at: j.completed_at,
      bookId,
      bookVersionId: typeof result.bookVersionId === "string" ? result.bookVersionId : null,
      firstChapterJobId: typeof result.firstChapterJobId === "string" ? result.firstChapterJobId : null,
      error: j.error ?? null,
    });
  }

  const latest = rows.find((j: any) => {
    const payload = j?.payload && typeof j.payload === "object" ? (j.payload as any) : {};
    const bookId = typeof payload.bookId === "string" ? payload.bookId : "";
    return bookId.startsWith("e2e-bookgen-auto-");
  }) as any;

  if (!latest) {
    console.log("[diag-bookgen-auto] No e2e-bookgen-auto-* jobs found in the last 5 rows.");
    return;
  }

  const payload = latest.payload && typeof latest.payload === "object" ? (latest.payload as any) : {};
  const result = latest.result && typeof latest.result === "object" ? (latest.result as any) : {};
  const bookId = String(payload.bookId || "").trim();
  const bookVersionId = String(result.bookVersionId || "").trim();
  if (!bookId || !bookVersionId) {
    console.log("[diag-bookgen-auto] Latest job missing bookId/bookVersionId; cannot fetch skeleton.");
    return;
  }

  // Fetch signed URL for skeleton via Edge function (do NOT print signed URLs).
  const inputUrl = `${SUPABASE_URL}/functions/v1/book-version-input-urls`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agent-Token": AGENT_TOKEN,
    "X-Organization-Id": ORGANIZATION_ID,
  };
  if (SUPABASE_ANON_KEY) headers["apikey"] = SUPABASE_ANON_KEY;

  const inputsResp = await fetch(inputUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookId,
      bookVersionId,
      expiresIn: 1200,
      target: "chapter",
      chapterIndex: 0,
      allowMissingImages: true,
    }),
  });
  if (!inputsResp.ok) {
    throw new Error(`book-version-input-urls HTTP ${inputsResp.status}`);
  }
  const inputsJson: any = await inputsResp.json().catch(() => null);
  if (!inputsJson?.ok) {
    throw new Error(`book-version-input-urls returned ok=false: ${JSON.stringify(inputsJson).slice(0, 500)}`);
  }

  const signed = String(inputsJson?.urls?.skeleton?.signedUrl || "").trim();
  if (!signed) {
    throw new Error("No skeleton signedUrl returned");
  }

  const skResp = await fetch(signed);
  if (!skResp.ok) {
    throw new Error(`Failed to download skeleton (HTTP ${skResp.status})`);
  }
  const skeleton = await skResp.json().catch(() => null);
  const counts = countSkeletonImages(skeleton);
  console.log("[diag-bookgen-auto] Skeleton image counts:", {
    bookId,
    bookVersionId,
    total: counts.total,
    withPrompt: counts.withPrompt,
  });
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("❌ diag-bookgen-auto-latest failed:", msg);
  process.exit(1);
});


