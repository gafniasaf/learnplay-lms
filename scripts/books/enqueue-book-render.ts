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

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(String(s || "").trim());
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  const target = String(process.argv[4] || "book").trim();
  if (!isUuid(bookId) || !isUuid(bookVersionId)) {
    console.error("Usage: npx tsx scripts/books/enqueue-book-render.ts <bookId> <bookVersionId> [book|chapter] [chapterIndex]");
    process.exit(1);
  }
  if (target !== "book" && target !== "chapter") {
    throw new Error("BLOCKED: target must be book|chapter");
  }

  const chapterIndexRaw = process.argv[5];
  const chapterIndex = target === "chapter" ? Number(chapterIndexRaw ?? "0") : null;
  if (target === "chapter" && (!Number.isFinite(chapterIndex!) || chapterIndex! < 0)) {
    throw new Error("BLOCKED: chapterIndex must be a non-negative number");
  }

  // Prefer VITE_SUPABASE_URL (frontend), fall back to SUPABASE_URL (backend). Not a silent fallback: requireEnv fails loud.
  const SUPABASE_URL = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const body: any = {
    bookId,
    bookVersionId,
    target,
    pipelineMode: "render_only",
    allowMissingImages: true,
    renderProvider: "prince_local",
  };
  if (target === "chapter") body.chapterIndex = Math.floor(chapterIndex!);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-enqueue-render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORG_ID,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok || json?.ok === false) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  console.log(JSON.stringify({ runId: json.runId, jobId: json.jobId, target: json.target }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ enqueue-book-render failed: ${msg}`);
  process.exit(1);
});


