import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

type Item = {
  id: string;
  termKey: "patient" | "verpleegkundige";
  termOriginal: string;
  termReplacement: string;
  chapter: number;
  sectionId: string;
  sectionTitle: string;
  paragraphId: string;
  field: string;
  count: number;
  snippet: string;
  text: string;
};

type Decision = {
  id: string;
  action: "keep_original" | "change_to_replacement";
  reason: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function parseModelSpec(raw: string): { provider: "openai" | "anthropic"; model: string } {
  const v = String(raw || "").trim();
  if (!v) {
    console.error("BLOCKED: --model is REQUIRED (e.g. anthropic:claude-sonnet-4-5 or openai:gpt-4o)");
    process.exit(1);
  }
  const parts = v.split(":").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    console.error("BLOCKED: --model must be provider-prefixed (anthropic:... or openai:...)");
    process.exit(1);
  }
  const provider = parts[0] as "openai" | "anthropic";
  const model = parts.slice(1).join(":");
  if (provider !== "openai" && provider !== "anthropic") {
    console.error("BLOCKED: provider must be openai or anthropic");
    process.exit(1);
  }
  if (!model) {
    console.error("BLOCKED: model name is missing");
    process.exit(1);
  }
  return { provider, model };
}

function stripHtml(raw: string): string {
  return String(raw || "").replace(/<[^>]+>/g, " ");
}

function normalizeWs(raw: string): string {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function snippetAround(text: string, index: number, size: number = 110): string {
  const start = Math.max(0, index - size);
  const end = Math.min(text.length, index + size);
  return normalizeWs(text.slice(start, end));
}

type TermSpec = {
  termKey: Item["termKey"];
  original: string;
  replacement: string;
  regex: RegExp;
};

const TERM_SPECS: TermSpec[] = [
  { termKey: "patient", original: "patiënt", replacement: "zorgvrager", regex: /pati[eë]nt(en)?/gi },
  { termKey: "verpleegkundige", original: "verpleegkundige", replacement: "zorgprofessional", regex: /verpleegkundige(n)?/gi },
];

function collectItemsFromSkeleton(sk: any): Item[] {
  const items: Item[] = [];

  const scan = (
    text: string,
    ctx: { chapter: number; sectionId: string; sectionTitle: string; paragraphId: string; field: string },
  ) => {
    const plain = normalizeWs(stripHtml(text));
    if (!plain) return;
    for (const spec of TERM_SPECS) {
      const matches = [...plain.matchAll(spec.regex)];
      if (!matches.length) continue;
      const first = matches[0];
      const snippet = snippetAround(plain, first.index ?? 0);
      const id = `${spec.termKey}|${ctx.chapter}|${ctx.sectionId}|${ctx.paragraphId}|${ctx.field}`;
      items.push({
        id,
        termKey: spec.termKey,
        termOriginal: spec.original,
        termReplacement: spec.replacement,
        chapter: ctx.chapter,
        sectionId: ctx.sectionId,
        sectionTitle: ctx.sectionTitle,
        paragraphId: ctx.paragraphId,
        field: ctx.field,
        count: matches.length,
        snippet,
        text: plain,
      });
    }
  };

  const walkBlocks = (blocks: any[], ctx: { chapter: number; sectionId: string; sectionTitle: string }) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "paragraph") {
        const pid = typeof b.id === "string" ? b.id : "";
        scan(b.basisHtml, { ...ctx, paragraphId: pid, field: "basis" });
        scan(b.praktijkHtml, { ...ctx, paragraphId: pid, field: "praktijk" });
        scan(b.verdiepingHtml, { ...ctx, paragraphId: pid, field: "verdieping" });
      } else if (b.type === "list" || b.type === "steps") {
        const pid = typeof b.id === "string" ? b.id : "";
        if (Array.isArray(b.items)) {
          for (const item of b.items) {
            scan(item, { ...ctx, paragraphId: pid, field: "item" });
          }
        }
      } else if (b.type === "subparagraph") {
        const spId = typeof b.id === "string" ? b.id : "";
        if (typeof b.title === "string") {
          scan(b.title, { ...ctx, paragraphId: spId || "subparagraph", field: "subparagraphTitle" });
        }
        walkBlocks(b.content || b.blocks || b.items, ctx);
      }
    }
  };

  const chapters = Array.isArray(sk?.chapters) ? sk.chapters : [];
  for (const ch of chapters) {
    const chNum = typeof ch?.number === "number" ? ch.number : null;
    if (chNum === null) continue;
    if (typeof ch?.title === "string") {
      scan(ch.title, { chapter: chNum, sectionId: "chapter", sectionTitle: "chapter", paragraphId: `chapter-${chNum}`, field: "chapterTitle" });
    }
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      const sid = typeof s?.id === "string" ? s.id : "";
      const st = typeof s?.title === "string" ? s.title : "";
      if (st) {
        scan(st, { chapter: chNum, sectionId: sid, sectionTitle: st, paragraphId: sid || "section", field: "sectionTitle" });
      }
      walkBlocks(s?.content || s?.blocks || s?.items, { chapter: chNum, sectionId: sid, sectionTitle: st });
    }

    const recap = ch?.recap;
    if (recap && typeof recap === "object") {
      const baseCtx = { chapter: chNum, sectionId: "recap", sectionTitle: "recap" };
      if (Array.isArray(recap.objectives)) {
        recap.objectives.forEach((obj: any, idx: number) => {
          if (obj && typeof obj.text === "string") {
            scan(obj.text, { ...baseCtx, paragraphId: `recap-objective-${idx}`, field: "recapObjective" });
          }
        });
      }
      if (Array.isArray(recap.glossary)) {
        recap.glossary.forEach((g: any, idx: number) => {
          if (g && typeof g.term === "string") {
            scan(g.term, { ...baseCtx, paragraphId: `glossary-${idx}`, field: "glossaryTerm" });
          }
          if (g && typeof g.definition === "string") {
            scan(g.definition, { ...baseCtx, paragraphId: `glossary-${idx}`, field: "glossaryDefinition" });
          }
        });
      }
      if (Array.isArray(recap.selfCheckQuestions)) {
        recap.selfCheckQuestions.forEach((q: any, idx: number) => {
          if (q && typeof q.question === "string") {
            scan(q.question, { ...baseCtx, paragraphId: `recap-question-${idx}`, field: "selfCheckQuestion" });
          }
        });
      }
    }
  }

  return items;
}

function safeJsonParse(raw: string): any | null {
  const t = String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function callOpenAI(model: string, system: string, user: string): Promise<any> {
  const key = requireEnv("OPENAI_API_KEY");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 2000,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(openai) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  const out = data?.choices?.[0]?.message?.content;
  const parsed = safeJsonParse(out);
  if (!parsed) throw new Error("LLM(openai) returned invalid JSON");
  return parsed;
}

async function callAnthropic(model: string, system: string, user: string): Promise<any> {
  const key = requireEnv("ANTHROPIC_API_KEY");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  const contentArr = Array.isArray(data?.content) ? data.content : [];
  const first = contentArr.find((c: any) => c?.type === "text" && typeof c.text === "string");
  const parsed = safeJsonParse(first?.text || "");
  if (!parsed) throw new Error("LLM(anthropic) returned invalid JSON");
  return parsed;
}

async function classifyBatch(
  items: Item[],
  provider: "openai" | "anthropic",
  model: string,
): Promise<Decision[]> {
  const system =
    "You are a Dutch healthcare editorial assistant.\n" +
    "Task: For each item, decide whether the ORIGINAL term should be kept or replaced by the provided replacement.\n" +
    "Keep the original ONLY if replacing it would be nonsensical or incorrect in context.\n" +
    "Otherwise choose change_to_replacement.\n" +
    "Return STRICT JSON only.\n";

  const user =
    "Return JSON in this exact shape:\n" +
    "{ \"decisions\": [{\"id\": string, \"action\": \"keep_original\"|\"change_to_replacement\", \"reason\": string}] }\n\n" +
    "ITEMS:\n" +
    JSON.stringify(
      items.map((i) => ({
        id: i.id,
        term: i.termOriginal,
        replacement: i.termReplacement,
        text: i.text,
      })),
      null,
      2,
    );

  const parsed =
    provider === "openai"
      ? await callOpenAI(model, system, user)
      : await callAnthropic(model, system, user);

  const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions : null;
  if (!decisions) throw new Error("LLM returned invalid shape (missing decisions[])");

  const out: Decision[] = [];
  for (const d of decisions) {
    const id = typeof d?.id === "string" ? d.id.trim() : "";
    const action = d?.action === "keep_original" || d?.action === "change_to_replacement" ? d.action : "";
    const reason = typeof d?.reason === "string" ? d.reason.trim() : "";
    if (!id || !action) continue;
    out.push({ id, action, reason: reason || "LLM decision" });
  }

  const byId = new Set(out.map((d) => d.id));
  const missing = items.filter((i) => !byId.has(i.id)).map((i) => i.id);
  if (missing.length) {
    throw new Error(`LLM decisions missing ${missing.length} item(s): ${missing.slice(0, 10).join(", ")}`);
  }
  return out;
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  if (!bookId || !bookVersionId) {
    console.error("Usage: npx tsx tmp/list-terminology-mentions-llm.ts <bookId> <bookVersionId> [--model provider:model]");
    process.exit(1);
  }

  const modelArgIdx = process.argv.indexOf("--model");
  const modelArg = modelArgIdx >= 0 ? String(process.argv[modelArgIdx + 1] || "").trim() : "anthropic:claude-sonnet-4-5";
  const { provider, model } = parseModelSpec(modelArg);

  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) {
    console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const { data: blob, error: dlErr } = await supabase.storage.from("books").download(skeletonPath);
  if (dlErr || !blob) throw new Error(dlErr?.message || `BLOCKED: failed to download ${skeletonPath}`);
  const skeleton = JSON.parse(await blob.text());

  const items = collectItemsFromSkeleton(skeleton);
  if (!items.length) {
    console.log(JSON.stringify({ ok: true, count: 0, decisions: 0 }, null, 2));
    return;
  }

  const batchSize = 10;
  const decisions: Decision[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchDecisions = await classifyBatch(batch, provider, model);
    decisions.push(...batchDecisions);
  }

  const decisionById = new Map(decisions.map((d) => [d.id, d]));
  const annotated = items.map((i) => {
    const d = decisionById.get(i.id);
    return {
      ...i,
      recommendation: d?.action || "change_to_replacement",
      reason: d?.reason || "LLM decision",
    };
  });

  const outJson = "tmp/af4-final/terminology_llm.json";
  fs.writeFileSync(outJson, JSON.stringify({ count: annotated.length, items: annotated }, null, 2));

  const group = (termKey: Item["termKey"], action: Decision["action"]) =>
    annotated.filter((i) => i.termKey === termKey && i.recommendation === action);

  const fmt = (i: any) => `- Ch ${i.chapter} §${i.sectionId} (${i.paragraphId}, ${i.field}): ${i.snippet}`;
  let report = "## Patiënt → zorgvrager (keep original)\n";
  report += group("patient", "keep_original").map(fmt).join("\n") + "\n\n";
  report += "## Patiënt → zorgvrager (change)\n";
  report += group("patient", "change_to_replacement").map(fmt).join("\n") + "\n\n";
  report += "## Verpleegkundige → zorgprofessional (keep original)\n";
  report += group("verpleegkundige", "keep_original").map(fmt).join("\n") + "\n\n";
  report += "## Verpleegkundige → zorgprofessional (change)\n";
  report += group("verpleegkundige", "change_to_replacement").map(fmt).join("\n") + "\n";

  const outMd = "tmp/af4-final/terminology_llm_report.md";
  fs.writeFileSync(outMd, report);

  console.log(JSON.stringify({ ok: true, count: annotated.length, outJson, outMd }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ list-terminology-mentions-llm failed: ${msg}`);
  process.exit(1);
});
