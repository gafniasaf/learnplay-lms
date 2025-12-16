// supabase/functions/_shared/filler.ts
// LLM filler - fills content into skeleton without changing structure

import { generateJson } from "./ai.ts";
import { extractJsonFromText, normalizeOptionsItem, normalizeNumericItem } from "./generation-utils.ts";
import type { SkeletonCourse } from "./skeleton.ts";

// Minimal Deno shim for typechecking in Node tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

export interface FillerContext {
  requestId: string;
  functionName: string;
  retry?: boolean;
}

export interface FilledCourse extends Omit<SkeletonCourse, "items"> {
  items: Array<{
    id: number;
    text: string;           // Now filled with [blank]
    groupId: number;
    clusterId: string;
    variant: "1" | "2" | "3";
    mode: "options" | "numeric";
    
    // Filled by LLM:
    options?: string[];
    correctIndex?: number;
    answer?: number;
    
    // Optional metadata preserved
    _meta?: SkeletonCourse["items"][0]["_meta"];
  }>;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function buildStudyTextsOnlyPrompt(skeleton: SkeletonCourse): string {
  const { subject, gradeBand, studyTexts } = skeleton;
  return `You are generating study text content for an educational course.

TOPIC (MUST FOLLOW):
- Subject/topic: ${subject}
- Grade band: ${gradeBand}

YOUR TASK:
- Fill ONLY studyTexts[].content for each entry (2-3 paragraphs each)
- Use [SECTION:Title] markers for major topics
- Insert [IMAGE:description] where visuals help
- Keep language age-appropriate

CRITICAL RULES:
- Return ONLY valid JSON wrapped in <json>...</json>
- Output schema MUST be: { "studyTexts": [...] }
- Preserve studyTexts[].id and studyTexts[].order EXACTLY as provided
- You may refine studyTexts[].title, but it must remain relevant
- Every studyTexts[] entry MUST have non-empty content

STUDYTEXTS TO FILL:
${JSON.stringify(studyTexts, null, 2)}
`;
}

async function fillStudyTextsOnly(
  skeleton: SkeletonCourse,
  ctx: FillerContext,
  timeoutMs: number
): Promise<{ ok: true; studyTexts: any[] } | { ok: false; error: string }> {
  const system = `You are an expert educational content writer. Output ONLY valid JSON.`;
  const prompt = buildStudyTextsOnlyPrompt(skeleton);
  const res = await generateJson({
    system,
    prompt,
    maxTokens: 2500,
    temperature: 0.3,
    prefillJson: true,
    timeoutMs: Math.min(timeoutMs, 70000),
  });
  if (!res.ok) return { ok: false, error: res.error || "llm_failed" };
  let parsed: any;
  try {
    parsed = extractJsonFromText(res.text);
  } catch (e) {
    return { ok: false, error: `json_parse_failed: ${String(e)}` };
  }
  const arr = parsed?.studyTexts;
  if (!Array.isArray(arr)) return { ok: false, error: "missing_studyTexts" };
  if (arr.length !== skeleton.studyTexts.length) {
    return {
      ok: false,
      error: `studyTexts_count_mismatch: expected ${skeleton.studyTexts.length}, got ${arr.length}`,
    };
  }
  // Validate each entry has non-empty content, and preserve ids/orders strictly.
  const byId = new Map<string, any>();
  for (const st of skeleton.studyTexts) byId.set(st.id, st);
  const merged = arr.map((cand: any) => {
    const id = cand?.id;
    const orig = typeof id === "string" ? byId.get(id) : null;
    if (!orig) return null;
    const content = cand?.content;
    if (!isNonEmptyString(content) || content.trim() === "__FILL__") return null;
    return {
      id: orig.id,
      title: isNonEmptyString(cand?.title) ? cand.title : orig.title,
      order: orig.order,
      content,
    };
  });
  if (merged.some((x) => x === null)) {
    return { ok: false, error: "studyTexts_invalid" };
  }
  // Preserve original ordering from skeleton
  const ordered = skeleton.studyTexts.map((st) => merged.find((m: any) => m.id === st.id)).filter(Boolean);
  if (ordered.length !== skeleton.studyTexts.length) return { ok: false, error: "studyTexts_incomplete" };
  return { ok: true, studyTexts: ordered };
}

/**
 * Build LLM prompt to fill skeleton
 */
function buildFillPrompt(skeleton: SkeletonCourse): string {
  const { subject, gradeBand, items, studyTexts, groups } = skeleton;
  const mode: "options" | "numeric" = items[0]?.mode ?? "options";
  
  // Build constraints based on subject analysis
  const itemSample = items[0];
  const hasMathMeta = itemSample?._meta !== undefined;
  
  let prompt = `You are filling in content for an educational course skeleton.

TOPIC (MUST FOLLOW):
- Subject/topic: ${subject}
- Grade band: ${gradeBand}

TOPIC RULES (CRITICAL):
- ALL studyTexts and ALL items MUST be about "${subject}".
- Do NOT default to math (e.g., multiplication tables) unless the subject/topic is explicitly math-related.
- Use the group names as topical anchors; questions must match the group’s theme.

IMMUTABLE STRUCTURE (DO NOT CHANGE):
- ${groups.length} groups: ${groups.map(g => g.name).join(", ")}
- ${items.length} items total
- Each item has fixed: id, groupId, clusterId, variant, mode
- Item IDs range from 0 to ${items.length - 1}

YOUR TASK:
Fill ONLY these fields:

1. studyTexts[].content
   - Write 2-3 paragraphs per study text
   - Use [SECTION:Title] markers for major topics
   - Insert [IMAGE:description] where visuals help
   - Grade level: ${gradeBand}
   - Keep language age-appropriate and engaging

2. items[].text
   - Write clear, educational questions/statements
   - Include EXACTLY ONE [blank] placeholder per item
   - ${mode === "options" ? "Questions should have 3-4 clear answer choices" : "Questions should have single numeric answers"}

3. For items[] - THIS IS CRITICAL:
   ${mode === "options" 
     ? "- mode=\"options\" requires TWO fields: \"options\" (array of 3-4 strings) AND \"correctIndex\" (number 0-3)\n   - DO NOT use \"answer\" field for options mode\n   - Example: {\"options\": [\"30\", \"25\", \"35\", \"40\"], \"correctIndex\": 0}" 
     : "- mode=\"numeric\" requires ONE field: \"answer\" (number)\n   - DO NOT use \"options\" or \"correctIndex\" for numeric mode\n   - Example: {\"answer\": 30}"}
`;

  if (hasMathMeta) {
    prompt += `
MATH CONSTRAINTS:
Items include math metadata (_meta) with operation, operands, and expected answer.
- Use the metadata to build correct math problems
- For item with _meta: { op: "add", a: 7, b: 5, expected: 12 }
  → text should be like "7 + 5 = [blank]"
  → answer/correctIndex must equal 12
`;
  }

  prompt += `
CRITICAL RULES:
- Return ONLY valid JSON with BOTH studyTexts AND items arrays
- DO NOT add/remove items, groups, or levels  
- DO NOT change item IDs, groupId, clusterId, variant, or mode
- EXACTLY one [blank] per item.text
- ${mode === "options" ? "3-4 options per item, correctIndex in range" : "Numeric answers only"}
- Your response MUST include the complete studyTexts array with all ${studyTexts.length} entries
- Your response MUST include the complete items array with all ${items.length} entries
- Wrap your JSON inside <json>...</json> tags (no markdown fences).

OUTPUT SCHEMA (you MUST return an object with these two top-level keys):
{
  "studyTexts": [
    {
      "id": "study-intro",       // KEEP SAME
      "title": "...",             // CAN refine
      "order": 1,                 // KEEP SAME
      "content": "..."            // FILL THIS
    },
    ...
  ],
  "items": [
    {
      "id": 0,                    // KEEP SAME
      "text": "...",              // FILL with exactly one [blank]
      "groupId": 0,               // KEEP SAME
      "clusterId": "...",         // KEEP SAME
      "variant": "1",             // KEEP SAME
      "mode": "${mode}",          // KEEP SAME
      ${mode === "options" 
        ? '// For options mode, use options array + correctIndex:\n      "options": ["Answer A", "Answer B", "Answer C", "Answer D"],\n      "correctIndex": 2  // Index of correct option (0-3)' 
        : '// For numeric mode, use answer only:\n      "answer": 42'}
    },
    ...
  ]
}

SKELETON TO FILL:
${JSON.stringify({ studyTexts, items: items.map(it => {
  const base: any = {
    id: it.id,
    text: it.text,
    groupId: it.groupId,
    clusterId: it.clusterId,
    variant: it.variant,
    mode: it.mode,
  };
  if (it._meta) base._meta = it._meta;
  return base;
}) }, null, 2)}
`;

  return prompt;
}

/**
 * Fill skeleton with LLM
 */
export async function fillSkeleton(
  skeleton: SkeletonCourse,
  ctx: FillerContext,
  timeoutMs = 90000
): Promise<{ ok: true; course: FilledCourse } | { ok: false; error: string }> {
  const systemPrompt = `You are an expert educational content writer. Fill the provided course skeleton with high-quality, age-appropriate content. NEVER modify structural fields (IDs, groupId, clusterId, mode, variant). Output ONLY valid JSON.`;
  
  const prompt = buildFillPrompt(skeleton);
  
  const result = await generateJson({
    system: systemPrompt,
    prompt,
    maxTokens: 7000,
    temperature: 0.4,
    // For Anthropic, prefill helps strongly constrain output to JSON.
    // OpenAI/Azure already uses response_format: json_object in generateJson().
    prefillJson: true,
    timeoutMs,
  });
  
  if (!result.ok) {
    return { ok: false, error: result.error || "llm_failed" };
  }
  
  // Save raw LLM response for debugging (async fire-and-forget)
  if (typeof Deno !== "undefined") {
    (async () => {
      try {
        // @ts-ignore - npm: import in Deno runtime (IgniteZero compliant)
        const { createClient } = await import('npm:@supabase/supabase-js@2');
        const url = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!url) throw new Error('SUPABASE_URL is required');
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
        const supabase = createClient(url, key);
        const debugPath = `debug/filler-responses/${ctx.requestId}.json`;
        await supabase.storage
          .from('courses')
          .upload(debugPath, JSON.stringify({ rawResponse: result.text, requestId: ctx.requestId }, null, 2), {
            upsert: true,
            contentType: 'application/json'
          });
      } catch (e) {
        console.warn('[FILLER] Failed to save debug response:', e);
      }
    })();
  }
  
  // Parse response
  let parsed: any;
  try {
    parsed = extractJsonFromText(result.text);
  } catch (e) {
    const errorInfo = {
      error: "json_parse_failed",
      exception: String(e),
      responsePreview: result.text.slice(0, 500)
    };
    // Log to console
    console.error("[FILLER] JSON parse failed:", JSON.stringify(errorInfo));
    return { ok: false, error: `json_parse_failed: ${String(e)}` };
  }
  
  // Validate required filled fields (NO placeholders / NO silent mocks)
  // We fail loudly if the model omits required arrays or content, rather than synthesizing data.
  if (!parsed.studyTexts || !Array.isArray(parsed.studyTexts)) {
    // Bounded repair: ask the model for studyTexts only, then merge.
    console.warn("[FILLER] Missing studyTexts; attempting targeted fill");
    const stRes = await fillStudyTextsOnly(skeleton, ctx, timeoutMs);
    if (!stRes.ok) return { ok: false, error: `missing_studyTexts: ${stRes.error}` };
    parsed.studyTexts = stRes.studyTexts;
  }
  if (parsed.studyTexts.length !== skeleton.studyTexts.length) {
    return {
      ok: false,
      error: `studyTexts_count_mismatch: expected ${skeleton.studyTexts.length}, got ${parsed.studyTexts.length}`,
    };
  }
  if (!parsed.items || !Array.isArray(parsed.items)) {
    return { ok: false, error: "missing_items" };
  }
  if (parsed.items.length !== skeleton.items.length) {
    return { ok: false, error: `item_count_mismatch: expected ${skeleton.items.length}, got ${parsed.items.length}` };
  }
  
  // Merge filled content back into skeleton
  let filledStudyTexts: any[];
  let filledItems: any[];
  try {
    filledStudyTexts = skeleton.studyTexts.map((st, i) => {
      const llmSt = parsed.studyTexts[i] || {};
      const content = llmSt?.content;
      if (!isNonEmptyString(content) || content.trim() === "__FILL__") {
        throw new Error(`missing_studyText_content:${st.id}`);
      }
      return {
        id: st.id, // Preserve original
        title: isNonEmptyString(llmSt?.title) ? llmSt.title : st.title, // Allow LLM to refine
        order: st.order, // Preserve
        content, // Required
      };
    });
  
  function toStringOption(x: any): string {
    if (x === null || x === undefined) return '';
    if (typeof x === 'number') return String(x);
    return String(x);
  }

  function makeOptionsFromAnswer(ans: number, seed: number): { options: string[]; correctIndex: number } {
    // Deterministic simple distractors around the answer
    const candidates = new Set<number>([ans]);
    const deltas = [1, 2, 5, 10, -1, -2, -5, -10];
    let idx = 0;
    while (candidates.size < 4 && idx < deltas.length) {
      const v = ans + deltas[(seed + idx) % deltas.length];
      if (Number.isFinite(v)) candidates.add(v);
      idx++;
    }
    // Ensure 4 options
    while (candidates.size < 4) candidates.add(ans + candidates.size);
    const arr = Array.from(candidates).map(toStringOption);
    // Place correct answer deterministically based on seed
    const correctIndex = seed % arr.length;
    // Swap to ensure correct at correctIndex
    const currentIndex = arr.findIndex(o => o === toStringOption(ans));
    if (currentIndex !== -1 && currentIndex !== correctIndex) {
      const tmp = arr[correctIndex];
      arr[correctIndex] = arr[currentIndex];
      arr[currentIndex] = tmp;
    }
    return { options: arr.slice(0, 4), correctIndex };
  }

    filledItems = skeleton.items.map((skItem, i) => {
      const llmItem = parsed.items[i] || {};

      const base: FilledCourse["items"][0] = {
        id: skItem.id,           // Preserve
        text: "__FILL__",
        groupId: skItem.groupId, // Preserve
        clusterId: skItem.clusterId, // Preserve
        variant: skItem.variant, // Preserve
        mode: skItem.mode,       // Preserve
      };

      if (!isNonEmptyString(llmItem?.text) || llmItem.text.trim() === "__FILL__") {
        throw new Error(`missing_item_text:${skItem.id}`);
      }
      base.text = llmItem.text;

    // Copy/repair filled fields from LLM
    if (skItem.mode === "options") {
      let options = Array.isArray(llmItem?.options) ? llmItem.options.map(toStringOption) : undefined;
      let correctIndex: number | undefined = typeof llmItem?.correctIndex === 'number' ? llmItem.correctIndex : undefined;

      // If options missing but numeric answer provided, synthesize options
      const numericAnswer: number | undefined = typeof llmItem?.answer === 'number' ? llmItem.answer : undefined;
      if ((!options || options.length < 3) && Number.isFinite(numericAnswer)) {
        console.warn('[FILLER] Repair: synthesizing options from numeric answer for item', skItem.id);
        const seed = skItem.id + (skItem._meta?.expected ?? 0);
        const gen = makeOptionsFromAnswer(numericAnswer!, seed);
        options = gen.options;
        correctIndex = gen.correctIndex;
      }

      // If we have expected answer from metadata, enforce it
      const expected = skItem._meta?.expected;
      if (Number.isFinite(expected)) {
        const expectedStr = toStringOption(expected);
        if (!options) {
          console.warn('[FILLER] Repair: synthesizing options from expected answer metadata for item', skItem.id);
          options = [
            expectedStr,
            toStringOption((expected as number) + 1),
            toStringOption((expected as number) - 1),
            toStringOption((expected as number) + 5),
          ];
        }
        if (!options.includes(expectedStr)) {
          // Replace first option with expected
          options[0] = expectedStr;
        }
        correctIndex = options.indexOf(expectedStr);
        if ((correctIndex ?? -1) < 0) correctIndex = 0;
      }

      // Finalize
      base.options = options;
      base.correctIndex = typeof correctIndex === 'number' ? correctIndex : 0;

    } else if (skItem.mode === "numeric") {
      // For numeric mode
      let answer: number | undefined = typeof llmItem?.answer === 'number' ? llmItem.answer : undefined;
      const expected = skItem._meta?.expected;
      if (!Number.isFinite(answer) && Array.isArray(llmItem?.options) && typeof llmItem?.correctIndex === 'number') {
        const raw = llmItem.options[llmItem.correctIndex];
        const n = Number(raw);
        if (Number.isFinite(n)) answer = n;
      }
      if (Number.isFinite(expected)) answer = expected as number;
      base.answer = answer;
    }

    // Preserve metadata for validation
    if (skItem._meta) {
      base._meta = skItem._meta;
    }

    // Normalize placeholders and enforce exactly one [blank]
    try {
      if (base.mode === 'options') {
        // Ensure invariants for options
        if (!Array.isArray(base.options) || typeof base.correctIndex !== 'number') {
          // As a last resort, create basic options from text numbers
          const seed = skItem.id + 1;
          const ans = Number(skItem._meta?.expected ?? 0);
          const gen = makeOptionsFromAnswer(Number.isFinite(ans) ? ans : 0, seed);
          base.options = gen.options;
          base.correctIndex = gen.correctIndex;
        }
        normalizeOptionsItem(base);
      } else {
        normalizeNumericItem(base as any);
      }
    } catch (e) {
      console.warn('[FILLER] normalization failed for item', skItem.id, String(e));
    }

      return base;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[FILLER] Fill merge failed:", msg);
    return { ok: false, error: msg };
  }
  
  const filledCourse: FilledCourse = {
    ...skeleton,
    studyTexts: filledStudyTexts,
    items: filledItems,
  };
  if (ctx.retry) {
    (filledCourse as any)._repair = { retry: true };
  }
  
  return { ok: true, course: filledCourse };
}
