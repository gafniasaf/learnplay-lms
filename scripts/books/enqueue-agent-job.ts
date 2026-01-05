import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { readFile } from "node:fs/promises";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  const jobType = String(process.argv[2] || "").trim();
  const payloadJson = String(process.argv[3] || "").trim();
  if (!jobType || !payloadJson) {
    console.error('Usage: npx tsx scripts/books/enqueue-agent-job.ts <jobType> "<payloadJson>"');
    console.error("  Tip: pass @<path-to-json-file> to avoid shell quoting issues.");
    process.exit(1);
  }

  const raw0 = payloadJson.startsWith("@") ? await readFile(payloadJson.slice(1), "utf8") : payloadJson;
  const raw = raw0.replace(/^\uFEFF/, ""); // tolerate UTF-8 BOM from Windows editors/Set-Content
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== "object") throw new Error("BLOCKED: payload must be an object");

  // Prefer VITE_SUPABASE_URL (frontend), fall back to SUPABASE_URL (backend). Not a silent fallback: requireEnv fails loud.
  const SUPABASE_URL = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": AGENT_TOKEN,
      "X-Organization-Id": ORG_ID,
    },
    body: JSON.stringify({ jobType, payload }),
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

  const jobId = typeof json?.jobId === "string" ? json.jobId : "";
  if (!jobId) throw new Error("BLOCKED: enqueue-job returned no jobId");
  console.log(jobId);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ enqueue-agent-job failed: ${msg}`);
  process.exit(1);
});


