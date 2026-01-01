import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { loadLearnPlayEnv } from "../../tests/helpers/parse-learnplay-env";

type IngestReport = {
  generatedAt: string;
  results: Array<{
    fileName: string;
    sha256: string;
    bookId: string;
    level: "n3" | "n4";
    title: string;
    response: { ok: true; bookVersionId: string } | { ok: false; error?: { code?: string; message?: string } };
  }>;
};

type AuditRow = {
  bookId: string;
  bookVersionId: string;
  fileName: string;
  strict: { ok: boolean; errorCode?: string; errorMessage?: string };
  allowMissing: { ok: boolean; missingCount?: number; missingSample?: string[]; errorCode?: string; errorMessage?: string };
};

function loadDeployEnv(): void {
  // Local-only deployment env (gitignored) used for live calls.
  // Do NOT print values.
  try {
    const deployEnvPath = path.resolve(process.cwd(), "supabase", ".deploy.env");
    if (!existsSync(deployEnvPath)) return;
    const content = readFileSync(deployEnvPath, "utf-8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line
        .slice(idx + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      if (!key) continue;
      if (!process.env[key] && value) process.env[key] = value;
    }
  } catch {
    // ignore; script will fail loudly if required vars are missing
  }
}

function truncate(s: string, max = 220): string {
  const t = String(s || "");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  // Supabase edge functions in this repo usually return 200 even for logical errors; still parse JSON.
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object") {
    return { ok: false, error: { code: "invalid_response", message: `Invalid JSON response (http ${res.status})` }, httpStatus: res.status };
  }
  return data;
}

async function main(): Promise<void> {
  loadDeployEnv();
  loadLearnPlayEnv();

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const AGENT_TOKEN = process.env.AGENT_TOKEN;
  const ORGANIZATION_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

  const missingEnv: string[] = [];
  if (!SUPABASE_URL) missingEnv.push("SUPABASE_URL");
  if (!AGENT_TOKEN) missingEnv.push("AGENT_TOKEN");
  if (!ORGANIZATION_ID) missingEnv.push("ORGANIZATION_ID");
  if (missingEnv.length) {
    console.error(`❌ BLOCKED: missing required env var(s): ${missingEnv.join(", ")}`);
    process.exit(1);
  }

  const ingestPath = path.resolve(process.cwd(), "tmp", "canonicaljsonsfrommacbook.ingest-report.json");
  if (!existsSync(ingestPath)) {
    console.error(`❌ BLOCKED: ingest report not found: ${ingestPath}`);
    console.error(`   Run: npx tsx scripts/books/ingest-canonicaljsonsfrommacbook.ts`);
    process.exit(1);
  }

  const ingest = JSON.parse(readFileSync(ingestPath, "utf-8")) as IngestReport;
  const rows = ingest.results
    .filter((r) => (r.response as any)?.ok === true)
    .map((r) => ({ fileName: r.fileName, bookId: r.bookId, bookVersionId: (r.response as any).bookVersionId as string }));

  if (!rows.length) {
    console.log("No ingested versions found in report.");
    return;
  }

  const endpoint = `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1/book-version-input-urls`;
  const authHeaders = { "x-agent-token": String(AGENT_TOKEN), "x-organization-id": String(ORGANIZATION_ID) };

  const audit: AuditRow[] = [];

  for (const r of rows) {
    // 1) Strict mode: requires either assets.zip or library index + mappings.
    const strictRes = await postJson(
      endpoint,
      { bookId: r.bookId, bookVersionId: r.bookVersionId, target: "book", allowMissingImages: false, expiresIn: 60 },
      authHeaders
    );

    const strictOk = strictRes?.ok === true;
    const strictErrorCode = strictOk ? undefined : String(strictRes?.error?.code || "error");
    const strictErrorMessage = strictOk ? undefined : truncate(String(strictRes?.error?.message || "Unknown error"));

    // 2) allowMissingImages mode: resolves via library index OR basename-convention fallback;
    // returns missingImageSrcs for anything still unresolved.
    const allowRes = await postJson(
      endpoint,
      { bookId: r.bookId, bookVersionId: r.bookVersionId, target: "book", allowMissingImages: true, expiresIn: 60 },
      authHeaders
    );

    const allowOk = allowRes?.ok === true;
    const missingList = Array.isArray(allowRes?.missingImageSrcs) ? (allowRes.missingImageSrcs as string[]) : [];
    const missingCount = allowOk ? missingList.length : undefined;
    const missingSample = allowOk ? missingList.slice(0, 25).map((s) => String(s)) : undefined;
    const allowErrorCode = allowOk ? undefined : String(allowRes?.error?.code || "error");
    const allowErrorMessage = allowOk ? undefined : truncate(String(allowRes?.error?.message || "Unknown error"));

    audit.push({
      bookId: r.bookId,
      bookVersionId: r.bookVersionId,
      fileName: r.fileName,
      strict: { ok: strictOk, ...(strictOk ? {} : { errorCode: strictErrorCode, errorMessage: strictErrorMessage }) },
      allowMissing: {
        ok: allowOk,
        ...(allowOk ? { missingCount, missingSample } : { errorCode: allowErrorCode, errorMessage: allowErrorMessage }),
      },
    });

    // Console summary line (no signed URLs)
    const strictLabel = strictOk ? "OK" : `FAIL:${strictErrorCode}`;
    const missLabel = allowOk ? String(missingCount) : `ERR:${allowErrorCode}`;
    console.log(`${r.bookId}  strict=${strictLabel}  missing=${missLabel}`);
  }

  mkdirSync(path.resolve(process.cwd(), "tmp"), { recursive: true });
  const outPath = path.resolve(process.cwd(), "tmp", "canonicaljsonsfrommacbook.image-audit.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), endpoint: "book-version-input-urls", audit }, null, 2), "utf-8");
  console.log(`\nWrote audit: ${path.relative(process.cwd(), outPath)}`);
}

await main();



