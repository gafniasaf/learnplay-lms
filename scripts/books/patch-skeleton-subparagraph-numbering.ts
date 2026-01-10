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

function normalizeWs(s: unknown): string {
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberPrefix(raw: string): string {
  const t = normalizeWs(raw);
  const m = t.match(/^\d+(?:\.\d+)*\s+(.+)$/);
  return m ? normalizeWs(m[1]) : t;
}

type AnyObj = Record<string, any>;

function patchSkeletonInPlace(sk: AnyObj): { changed: number; changedSections: Array<{ chapterIndex: number; sectionIndex: number; sectionId: string }> } {
  const chapters = Array.isArray(sk?.chapters) ? sk.chapters : [];
  let changed = 0;
  const changedSections: Array<{ chapterIndex: number; sectionIndex: number; sectionId: string }> = [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const sectionId = typeof sec?.id === "string" ? sec.id.trim() : "";
      if (!sectionId) continue;

      const blocks = Array.isArray(sec?.blocks) ? sec.blocks : [];
      const topSubs = blocks.filter((b: any) => b && typeof b === "object" && b.type === "subparagraph");

      // If this section already contains 3-level numbered subparagraphs (e.g. 1.2.1 ...), do nothing.
      const hasThreeLevel = topSubs.some((b: any) => {
        const t = typeof b.title === "string" ? normalizeWs(b.title) : "";
        return /^\d+(?:\.\d+){2,}\s+/.test(t);
      });
      if (hasThreeLevel) continue;

      // Convert 2-level titles that match the sectionId prefix (e.g. "1.2 Cysten") into "1.2.1 Cysten".
      let localChanged = 0;
      let idx = 0;
      for (const b of topSubs) {
        const t0 = typeof b.title === "string" ? normalizeWs(b.title) : "";
        const m = t0.match(/^(\d+\.\d+)\s+(.+)$/);
        if (!m) continue;
        const prefix = m[1];
        const rest = normalizeWs(m[2]);
        if (!prefix || prefix !== sectionId) continue;

        idx += 1;
        const nextNum = `${sectionId}.${idx}`;
        const nextTitle = `${nextNum} ${stripNumberPrefix(rest) || rest}`.trim();
        b.title = nextTitle;
        if (b.id === null || b.id === undefined || (typeof b.id !== "string")) {
          b.id = nextNum;
        } else if (typeof b.id === "string" && !b.id.trim()) {
          b.id = nextNum;
        }
        localChanged += 1;
      }

      if (localChanged > 0) {
        changed += localChanged;
        changedSections.push({ chapterIndex: ci, sectionIndex: si, sectionId });
      }
    }
  }

  return { changed, changedSections };
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  if (!bookId || !bookVersionId) {
    console.error("Usage: npx tsx scripts/books/patch-skeleton-subparagraph-numbering.ts <bookId> <bookVersionId>");
    process.exit(1);
  }

  const supabaseUrl = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const agentToken = requireEnv("AGENT_TOKEN");
  const orgId = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const { data: skBlob, error: skErr } = await supabase.storage.from("books").download(skeletonPath);
  if (skErr || !skBlob) throw new Error(`BLOCKED: skeleton.json missing at ${skeletonPath}`);

  const sk = JSON.parse(await skBlob.text());
  const p = patchSkeletonInPlace(sk);
  if (p.changed === 0) {
    console.log(JSON.stringify({ ok: true, bookId, bookVersionId, changed: 0, message: "No patch needed" }, null, 2));
    return;
  }

  // Save via Edge (this also compiles canonical + writes history).
  const res = await fetch(`${supabaseUrl}/functions/v1/book-version-save-skeleton`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": agentToken,
      "x-organization-id": orgId,
    },
    body: JSON.stringify({
      bookId,
      bookVersionId,
      skeleton: sk,
      note: "Patch: upgrade 2-level section subparagraph titles to 3-level (for locked outline + density validation)",
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
  if (!res.ok || json?.ok !== true) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${res.status}`;
    throw new Error(`book-version-save-skeleton failed: ${msg}`);
  }

  console.log(JSON.stringify({
    ok: true,
    bookId,
    bookVersionId,
    changed: p.changed,
    changedSections: p.changedSections.slice(0, 40),
    compiledCanonicalPath: json?.compiledCanonicalPath ?? null,
    skeletonPath: json?.skeletonPath ?? null,
  }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ patch-skeleton-subparagraph-numbering failed: ${msg}`);
  process.exit(1);
});


