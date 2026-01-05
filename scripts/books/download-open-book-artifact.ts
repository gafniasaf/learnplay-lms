import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function safeFileName(raw: string): string {
  return String(raw || "")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
}

async function main() {
  const artifactId = String(process.argv[2] || "").trim();
  if (!artifactId || !/^[0-9a-f-]{36}$/i.test(artifactId)) {
    console.error("Usage: npx tsx scripts/books/download-open-book-artifact.ts <artifactId>");
    process.exit(1);
  }

  // Prefer VITE_SUPABASE_URL (frontend), fall back to SUPABASE_URL (backend). Not a silent fallback: requireEnv fails loud.
  const SUPABASE_URL = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");
  const APIKEY =
    (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-artifact-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORG_ID,
      ...(APIKEY ? { apikey: APIKEY } : {}),
    },
    body: JSON.stringify({ artifactId, expiresIn: 3600 }),
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

  const signedUrl = typeof json?.signedUrl === "string" ? json.signedUrl : "";
  const kind = typeof json?.artifact?.kind === "string" ? json.artifact.kind : "artifact";
  if (!signedUrl) throw new Error("BLOCKED: Missing signedUrl");

  const dl = await fetch(signedUrl);
  if (!dl.ok) throw new Error(`Download failed (${dl.status})`);
  const ab = await dl.arrayBuffer();

  const outDir = path.join(process.cwd(), "tmp", "book-artifacts", "downloaded");
  await mkdir(outDir, { recursive: true });

  const outPath = path.join(outDir, `${safeFileName(kind)}-${safeFileName(artifactId)}.pdf`);
  await writeFile(outPath, Buffer.from(ab));

  console.log(`Saved: ${outPath}`);

  if (process.platform === "win32") {
    // Open in default PDF viewer (best-effort, no user interaction required).
    const ps = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process -FilePath '${outPath.replace(/'/g, "''")}'`,
    ];
    const child = spawn("powershell", ps, { stdio: "ignore" });
    child.on("error", () => {});
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ download-open-book-artifact failed: ${msg}`);
  process.exit(1);
});


