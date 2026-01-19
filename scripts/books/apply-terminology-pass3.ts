import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { compileSkeletonToCanonical } from "../../src/lib/books/bookSkeletonCore.js";
import fs from "fs";

loadLocalEnvForTests();

type ChangeItem = {
  termKey: "patient" | "verpleegkundige";
  termOriginal: string;
  termReplacement: string;
  chapter: number;
  sectionId: string;
  paragraphId: string;
  field: string;
  recommendation: "keep_original" | "change_to_replacement";
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function requireId(name: string, raw: unknown): string {
  const v = String(raw || "").trim();
  if (!v) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v;
}

function capitalize(word: string): string {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

function replaceTerm(text: string, termKey: ChangeItem["termKey"]): { text: string; count: number } {
  if (!text) return { text, count: 0 };
  if (termKey === "patient") {
    const re = /pati[eë]nt(en)?/gi;
    let count = 0;
    const out = text.replace(re, (match, plural) => {
      count += 1;
      const isPlural = typeof plural === "string" && plural.length > 0;
      const base = isPlural ? "zorgvragers" : "zorgvrager";
      const isCap = match[0] === match[0].toUpperCase();
      return isCap ? capitalize(base) : base;
    });
    return { text: out, count };
  }
  const re = /verpleegkundige(n)?/gi;
  let count = 0;
  const out = text.replace(re, (match, plural) => {
    count += 1;
    const isPlural = typeof plural === "string" && plural.length > 0;
    const base = isPlural ? "zorgprofessionals" : "zorgprofessional";
    const isCap = match[0] === match[0].toUpperCase();
    return isCap ? capitalize(base) : base;
  });
  return { text: out, count };
}

async function main() {
  const bookId = requireId("bookId", process.argv[2]);
  const bookVersionId = requireId("bookVersionId", process.argv[3]);
  const decisionsPath = String(process.argv[4] || "tmp/af4-final/terminology_llm.json").trim();

  if (!fs.existsSync(decisionsPath)) {
    throw new Error(`BLOCKED: decisions file not found: ${decisionsPath}`);
  }

  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");
  if (!SUPABASE_URL) {
    console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(decisionsPath, "utf8"));
  const items: ChangeItem[] = Array.isArray(raw?.items) ? raw.items : [];
  if (!items.length) throw new Error("BLOCKED: decisions file has no items");

  const changes = new Map<string, ChangeItem>();
  for (const item of items) {
    if (item.recommendation !== "change_to_replacement") continue;
    const key = `${item.termKey}|${item.chapter}|${item.sectionId}|${item.paragraphId}|${item.field}`;
    if (!changes.has(key)) changes.set(key, item);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const { data: blob, error: dlErr } = await supabase.storage.from("books").download(skeletonPath);
  if (dlErr || !blob) throw new Error(dlErr?.message || `BLOCKED: failed to download ${skeletonPath}`);
  const skeleton = JSON.parse(await blob.text());

  let replacedPatient = 0;
  let replacedNurse = 0;

  const applyField = (text: string, termKey: ChangeItem["termKey"]) => {
    const { text: out, count } = replaceTerm(text, termKey);
    if (termKey === "patient") replacedPatient += count;
    else replacedNurse += count;
    return out;
  };

  const applyByKey = (ctx: { termKey: ChangeItem["termKey"]; chapter: number; sectionId: string; paragraphId: string; field: string }, text: string) => {
    const key = `${ctx.termKey}|${ctx.chapter}|${ctx.sectionId}|${ctx.paragraphId}|${ctx.field}`;
    if (!changes.has(key)) return text;
    return applyField(text, ctx.termKey);
  };

  const walkBlocks = (blocks: any[], ctx: { chapter: number; sectionId: string }) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "paragraph") {
        const pid = typeof b.id === "string" ? b.id : "";
        if (typeof b.basisHtml === "string") {
          b.basisHtml = applyByKey({ termKey: "patient", ...ctx, paragraphId: pid, field: "basis" }, b.basisHtml);
          b.basisHtml = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: pid, field: "basis" }, b.basisHtml);
        }
        if (typeof b.praktijkHtml === "string") {
          b.praktijkHtml = applyByKey({ termKey: "patient", ...ctx, paragraphId: pid, field: "praktijk" }, b.praktijkHtml);
          b.praktijkHtml = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: pid, field: "praktijk" }, b.praktijkHtml);
        }
        if (typeof b.verdiepingHtml === "string") {
          b.verdiepingHtml = applyByKey({ termKey: "patient", ...ctx, paragraphId: pid, field: "verdieping" }, b.verdiepingHtml);
          b.verdiepingHtml = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: pid, field: "verdieping" }, b.verdiepingHtml);
        }
      } else if (b.type === "list" || b.type === "steps") {
        const pid = typeof b.id === "string" ? b.id : "";
        if (Array.isArray(b.items)) {
          b.items = b.items.map((item: any) => {
            if (typeof item !== "string") return item;
            let out = item;
            out = applyByKey({ termKey: "patient", ...ctx, paragraphId: pid, field: "item" }, out);
            out = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: pid, field: "item" }, out);
            return out;
          });
        }
      } else if (b.type === "subparagraph") {
        const spId = typeof b.id === "string" ? b.id : "subparagraph";
        if (typeof b.title === "string") {
          let out = b.title;
          out = applyByKey({ termKey: "patient", ...ctx, paragraphId: spId, field: "subparagraphTitle" }, out);
          out = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: spId, field: "subparagraphTitle" }, out);
          b.title = out;
        }
        walkBlocks(b.content || b.blocks || b.items, ctx);
      }
    }
  };

  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters : [];
  for (const ch of chapters) {
    const chNum = typeof ch?.number === "number" ? ch.number : null;
    if (chNum === null) continue;
    if (typeof ch.title === "string") {
      let out = ch.title;
      out = applyByKey({ termKey: "patient", chapter: chNum, sectionId: "chapter", paragraphId: `chapter-${chNum}`, field: "chapterTitle" }, out);
      out = applyByKey({ termKey: "verpleegkundige", chapter: chNum, sectionId: "chapter", paragraphId: `chapter-${chNum}`, field: "chapterTitle" }, out);
      ch.title = out;
    }
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      const sid = typeof s?.id === "string" ? s.id : "";
      if (typeof s?.title === "string" && sid) {
        let out = s.title;
        out = applyByKey({ termKey: "patient", chapter: chNum, sectionId: sid, paragraphId: sid, field: "sectionTitle" }, out);
        out = applyByKey({ termKey: "verpleegkundige", chapter: chNum, sectionId: sid, paragraphId: sid, field: "sectionTitle" }, out);
        s.title = out;
      }
      walkBlocks(s?.content || s?.blocks || s?.items, { chapter: chNum, sectionId: sid });
    }

    const recap = ch?.recap;
    if (recap && typeof recap === "object") {
      const ctx = { chapter: chNum, sectionId: "recap", paragraphId: "recap" };
      if (Array.isArray(recap.objectives)) {
        recap.objectives = recap.objectives.map((obj: any, idx: number) => {
          if (!obj || typeof obj !== "object") return obj;
          if (typeof obj.text === "string") {
            let out = obj.text;
            out = applyByKey({ termKey: "patient", ...ctx, paragraphId: `recap-objective-${idx}`, field: "recapObjective" }, out);
            out = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: `recap-objective-${idx}`, field: "recapObjective" }, out);
            obj.text = out;
          }
          return obj;
        });
      }
      if (Array.isArray(recap.glossary)) {
        recap.glossary = recap.glossary.map((g: any, idx: number) => {
          if (!g || typeof g !== "object") return g;
          if (typeof g.term === "string") {
            let out = g.term;
            out = applyByKey({ termKey: "patient", ...ctx, paragraphId: `glossary-${idx}`, field: "glossaryTerm" }, out);
            out = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: `glossary-${idx}`, field: "glossaryTerm" }, out);
            g.term = out;
          }
          if (typeof g.definition === "string") {
            let out = g.definition;
            out = applyByKey({ termKey: "patient", ...ctx, paragraphId: `glossary-${idx}`, field: "glossaryDefinition" }, out);
            out = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: `glossary-${idx}`, field: "glossaryDefinition" }, out);
            g.definition = out;
          }
          return g;
        });
      }
      if (Array.isArray(recap.selfCheckQuestions)) {
        recap.selfCheckQuestions = recap.selfCheckQuestions.map((q: any, idx: number) => {
          if (!q || typeof q !== "object") return q;
          if (typeof q.question === "string") {
            let out = q.question;
            const pid = `recap-question-${idx}`;
            out = applyByKey({ termKey: "patient", ...ctx, paragraphId: pid, field: "selfCheckQuestion" }, out);
            out = applyByKey({ termKey: "verpleegkundige", ...ctx, paragraphId: pid, field: "selfCheckQuestion" }, out);
            q.question = out;
          }
          return q;
        });
      }
    }
  }

  // Save updated skeleton via edge function to keep audit trail.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-version-save-skeleton`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORG_ID,
    },
    body: JSON.stringify({
      bookId,
      bookVersionId,
      skeleton,
      note: "Pass 3: LLM terminology normalization (patient->zorgvrager, verpleegkundige->zorgprofessional)",
      compileCanonical: false,
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

  const compiled = compileSkeletonToCanonical(skeleton);
  const compiledText = JSON.stringify(compiled, null, 2);
  const compiledPath = `books/${bookId}/${bookVersionId}/compiled_canonical.json`;
  const { error: upErr } = await supabase.storage.from("books").upload(compiledPath, new Blob([compiledText], { type: "application/json" }), {
    upsert: true,
    contentType: "application/json",
    cacheControl: "no-cache",
  });
  if (upErr) throw new Error(upErr.message);

  console.log(
    JSON.stringify(
      {
        ok: true,
        replacedPatient,
        replacedVerpleegkundige: replacedNurse,
        skeletonPath,
        compiledPath,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ apply-terminology-pass3 failed: ${msg}`);
  process.exit(1);
});
