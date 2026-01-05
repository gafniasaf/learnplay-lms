import { readFile } from "node:fs/promises";
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
  const fixturePath = String(process.argv[2] || "").trim();
  const bookId = String(process.argv[3] || "").trim();
  const bookVersionId = String(process.argv[4] || "").trim();

  if (!fixturePath) {
    console.error("Usage: npx tsx scripts/books/update-book-skeleton-from-fixture.ts <fixture.json> <bookId> <bookVersionId>");
    process.exit(1);
  }
  if (!isUuid(bookId) || !isUuid(bookVersionId)) {
    throw new Error("BLOCKED: bookId and bookVersionId must be UUIDs");
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

  const raw = await readFile(fixturePath, "utf8");
  const skeleton = JSON.parse(raw);
  if (!skeleton || typeof skeleton !== "object") throw new Error("BLOCKED: fixture is not valid JSON");

  // Rewrite meta ids for the target version (do not change structure/content).
  const meta = (skeleton as any).meta && typeof (skeleton as any).meta === "object" ? (skeleton as any).meta : {};
  (skeleton as any).meta = {
    ...meta,
    bookId,
    bookVersionId,
    schemaVersion: "skeleton_v1",
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-version-save-skeleton`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORG_ID,
      ...(APIKEY ? { apikey: APIKEY } : {}),
    },
    body: JSON.stringify({
      bookId,
      bookVersionId,
      skeleton,
      note: "Update skeleton from fixture (add bold-term markers for index/glossary + keep placeholders)",
      compileCanonical: true,
    }),
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

  console.log("✅ Updated skeleton + compiled canonical for", { bookId, bookVersionId });
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ update-book-skeleton-from-fixture failed: ${msg}`);
  process.exit(1);
});


