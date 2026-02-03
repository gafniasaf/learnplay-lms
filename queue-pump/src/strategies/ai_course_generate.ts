/**
 * ai_course_generate (Factory / ai_agent_jobs)
 *
 * Generates educational courses via skeleton-first approach:
 * - Builds course skeleton (groups, items, study texts structure)
 * - Fills content using LLM
 * - Validates the course
 * - Persists to Supabase Storage
 *
 * IMPORTANT:
 * - No silent fallbacks (fail loudly on missing required inputs/env)
 * - Uses queue-pump AI wrapper for provider-agnostic LLM calls
 */
import type { JobContext, JobExecutor } from "./types.js";
import { createClient } from "@supabase/supabase-js";
import { emitAgentJobEvent } from "../job-events.js";
import { generateJson } from "../ai.js";
import { requireEnv, parseIntEnv } from "../env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SkeletonParams {
  subject: string;
  grade: string | null;
  itemsPerGroup: number;
  levelsCount?: number;
  mode: "options" | "numeric";
  studyTextsCount?: number;
  notes?: string;
}

interface MathMeta {
  op: "add" | "sub" | "mul" | "div";
  a: number;
  b: number;
  expected: number;
}

interface SkeletonItem {
  id: number;
  text: string;
  groupId: number;
  clusterId: string;
  variant: "1" | "2" | "3";
  mode: "options" | "numeric";
  _meta?: MathMeta;
}

interface SkeletonStudyText {
  id: string;
  title: string;
  order: number;
  content: string;
}

interface SkeletonGroup {
  id: number;
  name: string;
}

interface SkeletonLevel {
  id: number;
  title: string;
  start: number;
  end: number;
}

interface SkeletonCourse {
  id: string;
  title: string;
  description?: string;
  subject: string;
  gradeBand: string;
  contentVersion: string;
  groups: SkeletonGroup[];
  levels: SkeletonLevel[];
  items: SkeletonItem[];
  studyTexts: SkeletonStudyText[];
  notes?: string;
}

interface FilledItem extends Omit<SkeletonItem, "text"> {
  text: string;
  options?: string[];
  correctIndex?: number;
  answer?: number;
  explain?: string;
}

interface FilledCourse extends Omit<SkeletonCourse, "items"> {
  items: FilledItem[];
}

interface ValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  itemId?: number;
  field?: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

type JobStep = "init" | "skeleton" | "fill" | "validate" | "persist" | "done";

interface JobState {
  step: JobStep;
  courseId: string;
  subject: string;
  grade: string | null;
  gradeBand: string;
  mode: "options" | "numeric";
  itemsPerGroup: number;
  levelsCount: number;
  studyTextsCount: number;
  notes?: string;
  title?: string;
  skeleton?: SkeletonCourse;
  filledCourse?: FilledCourse;
  fillAttempts: number;
  validationAttempts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function safeNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sanitizeId(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Builder
// ─────────────────────────────────────────────────────────────────────────────

function detectMathOps(subject: string): Array<"add" | "sub" | "mul" | "div"> {
  const s = subject.toLowerCase();
  const ops: Array<"add" | "sub" | "mul" | "div"> = [];
  
  if (s.includes("add") || s.includes("plus") || s.includes("sum")) ops.push("add");
  if (s.includes("sub") || s.includes("minus") || s.includes("difference")) ops.push("sub");
  if (s.includes("mult") || s.includes("times") || s.includes("product")) ops.push("mul");
  if (s.includes("div") || s.includes("quotient")) ops.push("div");
  
  if (ops.length === 0 && s.includes("math")) ops.push("add");
  
  return ops;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateMathMeta(op: "add" | "sub" | "mul" | "div", itemId: number, grade: string | null): MathMeta {
  const rand = seededRandom(itemId * 31 + op.charCodeAt(0));
  const gradeNum = parseInt(grade || "3", 10) || 3;
  
  let a: number, b: number, expected: number;
  const maxVal = Math.min(10 + gradeNum * 5, 100);
  
  switch (op) {
    case "add":
      a = Math.floor(rand() * maxVal) + 1;
      b = Math.floor(rand() * maxVal) + 1;
      expected = a + b;
      break;
    case "sub":
      a = Math.floor(rand() * maxVal) + 10;
      b = Math.floor(rand() * a) + 1;
      expected = a - b;
      break;
    case "mul":
      a = Math.floor(rand() * 12) + 1;
      b = Math.floor(rand() * 12) + 1;
      expected = a * b;
      break;
    case "div":
      b = Math.floor(rand() * 10) + 2;
      expected = Math.floor(rand() * 10) + 1;
      a = b * expected;
      break;
    default:
      a = 1; b = 1; expected = 2;
  }
  
  return { op, a, b, expected };
}

function makeClusterId(groupName: string, groupId: number, clusterIndex: number): string {
  const baseRaw = sanitizeId(groupName);
  const prefix = `g${groupId}-`;
  const suffix = `-cluster-${clusterIndex}`;
  const maxBaseLen = Math.max(1, 64 - prefix.length - suffix.length);
  let base = baseRaw.length > maxBaseLen ? baseRaw.slice(0, maxBaseLen) : baseRaw;
  base = base.replace(/-+$/g, "");
  if (!base) base = `group-${groupId}`;
  const out = `${prefix}${base}${suffix}`;
  return out.length > 64 ? out.slice(0, 64) : out;
}

function buildGroups(subject: string): SkeletonGroup[] {
  const mathOps = detectMathOps(subject);
  
  if (mathOps.length > 0) {
    return mathOps.map((op, i) => ({
      id: i,
      name: op === "add" ? "Addition" 
           : op === "sub" ? "Subtraction"
           : op === "mul" ? "Multiplication"
           : "Division"
    }));
  }
  
  const topic = capitalize(subject.trim()) || "Topic";
  return [
    { id: 0, name: `${topic}: Foundations` },
    { id: 1, name: `${topic}: Key Concepts` },
    { id: 2, name: `${topic}: Applications` },
  ];
}

function buildSkeleton(params: SkeletonParams): SkeletonCourse {
  const { subject, grade, itemsPerGroup, levelsCount = 3, mode } = params;
  
  const groups = buildGroups(subject);
  const mathOps = detectMathOps(subject);
  const isMath = mathOps.length > 0;
  
  const items: SkeletonItem[] = [];
  let itemId = 0;
  
  for (const group of groups) {
    const opForGroup = mathOps[group.id] || mathOps[0];
    
    for (let j = 0; j < itemsPerGroup; j++) {
      const item: SkeletonItem = {
        id: itemId,
        text: "__FILL__",
        groupId: group.id,
        clusterId: makeClusterId(group.name, group.id, Math.floor(j / 3)),
        variant: (((j % 3) + 1).toString()) as "1" | "2" | "3",
        mode,
      };
      
      if (isMath && opForGroup) {
        item._meta = generateMathMeta(opForGroup, itemId, grade);
      }
      
      items.push(item);
      itemId++;
    }
  }
  
  const actualLevelsCount = Math.min(Math.max(levelsCount, 1), 6);
  const totalItems = items.length;
  const itemsPerLevel = Math.ceil(totalItems / actualLevelsCount);
  
  const levels: SkeletonLevel[] = [];
  for (let i = 0; i < actualLevelsCount; i++) {
    levels.push({
      id: i + 1,
      title: `Level ${i + 1}`,
      start: i * itemsPerLevel,
      end: Math.min((i + 1) * itemsPerLevel - 1, totalItems - 1),
    });
  }
  
  const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(n)));
  const desiredStudyTextsCount = typeof params.studyTextsCount === "number" 
    ? clampInt(params.studyTextsCount, 1, 12) 
    : 2;

  const studyTexts: SkeletonStudyText[] = [];
  const usedIds = new Set<string>();
  
  const pushStudyText = (id: string, title: string) => {
    if (studyTexts.length >= desiredStudyTextsCount) return;
    let safeId = id;
    let i = 2;
    while (usedIds.has(safeId)) {
      safeId = `${id}-${i++}`;
    }
    usedIds.add(safeId);
    studyTexts.push({
      id: safeId,
      title,
      order: studyTexts.length + 1,
      content: "__FILL__",
    });
  };

  pushStudyText("study-intro", "Introduction");

  for (const g of groups) {
    if (studyTexts.length >= desiredStudyTextsCount) break;
    pushStudyText(`study-group-${g.id}`, g.name);
  }

  const extras = [
    { id: "study-key-concepts", title: "Key Concepts" },
    { id: "study-examples", title: "Worked Examples" },
    { id: "study-misconceptions", title: "Common Misconceptions" },
    { id: "study-practice", title: "Practice & Review" },
  ];
  for (const ex of extras) {
    if (studyTexts.length >= desiredStudyTextsCount) break;
    pushStudyText(ex.id, ex.title);
  }

  let extraIdx = 1;
  while (studyTexts.length < desiredStudyTextsCount) {
    pushStudyText(`study-extra-${extraIdx}`, `Extra Study Topic ${extraIdx}`);
    extraIdx++;
  }
  
  return {
    id: sanitizeId(subject),
    title: capitalize(subject),
    subject,
    gradeBand: grade || "All Grades",
    contentVersion: `skeleton-${Date.now()}`,
    groups,
    levels,
    items,
    studyTexts,
    notes: typeof params.notes === "string" && params.notes.trim() ? params.notes.trim() : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Filler
// ─────────────────────────────────────────────────────────────────────────────

function buildFillPrompt(skeleton: SkeletonCourse): string {
  const { subject, gradeBand, items, studyTexts, groups, notes } = skeleton;
  const mode = items[0]?.mode ?? "options";

  const notesBlock = typeof notes === "string" && notes.trim()
    ? `SPECIAL REQUESTS (MUST FOLLOW):\n${notes.trim()}\n\n`
    : "";
  
  const hasMathMeta = items[0]?._meta !== undefined;
  
  let prompt = `You are filling in content for an educational course skeleton.

TOPIC (MUST FOLLOW):
- Subject/topic: ${subject}
- Grade band: ${gradeBand}

TOPIC RULES (CRITICAL):
- ALL studyTexts and ALL items MUST be about "${subject}".
- Do NOT default to math unless the subject is explicitly math-related.
- Use the group names as topical anchors; questions must match the group's theme.

${notesBlock}IMMUTABLE STRUCTURE (DO NOT CHANGE):
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

OUTPUT SCHEMA:
{
  "studyTexts": [...],
  "items": [...]
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

function extractJsonFromText(text: string): any {
  // Try <json>...</json> tags first
  const tagMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagMatch) {
    return JSON.parse(tagMatch[1].trim());
  }
  
  // Try markdown code blocks
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    return JSON.parse(codeMatch[1].trim());
  }
  
  // Try raw JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  throw new Error("No valid JSON found in response");
}

function normalizeOptionsItem(item: any): void {
  // Ensure exactly one [blank]
  const blanks = (item.text?.match(/\[blank\]/gi) || []).length;
  if (blanks === 0 && item.text) {
    item.text = item.text + " [blank]";
  } else if (blanks > 1 && item.text) {
    let count = 0;
    item.text = item.text.replace(/\[blank\]/gi, () => {
      count++;
      return count === 1 ? "[blank]" : "";
    });
  }
  
  // Ensure options array
  if (!Array.isArray(item.options)) {
    item.options = ["Option A", "Option B", "Option C", "Option D"];
  }
  
  // Ensure correctIndex
  if (typeof item.correctIndex !== "number") {
    item.correctIndex = 0;
  }
  item.correctIndex = Math.max(0, Math.min(item.correctIndex, item.options.length - 1));
}

function normalizeNumericItem(item: any): void {
  // Ensure exactly one [blank]
  const blanks = (item.text?.match(/\[blank\]/gi) || []).length;
  if (blanks === 0 && item.text) {
    item.text = item.text + " [blank]";
  } else if (blanks > 1 && item.text) {
    let count = 0;
    item.text = item.text.replace(/\[blank\]/gi, () => {
      count++;
      return count === 1 ? "[blank]" : "";
    });
  }
  
  // Ensure answer is a number
  if (typeof item.answer !== "number") {
    item.answer = item._meta?.expected ?? 0;
  }
  
  // Remove options if present
  delete item.options;
  delete item.correctIndex;
}

async function fillSkeleton(
  skeleton: SkeletonCourse,
  timeoutMs = 120000
): Promise<{ ok: true; course: FilledCourse } | { ok: false; error: string }> {
  const systemPrompt = `You are an expert educational content writer. Fill the provided course skeleton with high-quality, age-appropriate content. NEVER modify structural fields (IDs, groupId, clusterId, mode, variant). Output ONLY valid JSON.`;
  
  const prompt = buildFillPrompt(skeleton);
  
  const result = await generateJson({
    system: systemPrompt,
    prompt,
    maxTokens: 7000,
    temperature: 0.4,
    prefillJson: true,
    timeoutMs,
  });
  
  if (!result.ok) {
    return { ok: false, error: result.error || "llm_failed" };
  }
  
  let parsed: any;
  try {
    parsed = extractJsonFromText(result.text);
  } catch (e) {
    return { ok: false, error: `json_parse_failed: ${String(e)}` };
  }
  
  if (!parsed.studyTexts || !Array.isArray(parsed.studyTexts)) {
    return { ok: false, error: "missing_studyTexts" };
  }
  if (parsed.studyTexts.length !== skeleton.studyTexts.length) {
    return { ok: false, error: `studyTexts_count_mismatch: expected ${skeleton.studyTexts.length}, got ${parsed.studyTexts.length}` };
  }
  if (!parsed.items || !Array.isArray(parsed.items)) {
    return { ok: false, error: "missing_items" };
  }
  if (parsed.items.length !== skeleton.items.length) {
    return { ok: false, error: `item_count_mismatch: expected ${skeleton.items.length}, got ${parsed.items.length}` };
  }
  
  // Merge filled content back into skeleton
  const filledStudyTexts = skeleton.studyTexts.map((st, i) => {
    const llmSt = parsed.studyTexts[i] || {};
    const content = llmSt?.content;
    if (typeof content !== "string" || !content.trim() || content.trim() === "__FILL__") {
      throw new Error(`missing_studyText_content:${st.id}`);
    }
    return {
      id: st.id,
      title: typeof llmSt?.title === "string" && llmSt.title.trim() ? llmSt.title : st.title,
      order: st.order,
      content,
    };
  });
  
  const filledItems: FilledItem[] = skeleton.items.map((skItem, i) => {
    const llmItem = parsed.items[i] || {};
    
    const base: FilledItem = {
      id: skItem.id,
      text: "__FILL__",
      groupId: skItem.groupId,
      clusterId: skItem.clusterId,
      variant: skItem.variant,
      mode: skItem.mode,
    };
    
    if (typeof llmItem?.text !== "string" || !llmItem.text.trim() || llmItem.text.trim() === "__FILL__") {
      throw new Error(`missing_item_text:${skItem.id}`);
    }
    base.text = llmItem.text;
    
    if (skItem.mode === "options") {
      base.options = Array.isArray(llmItem?.options) ? llmItem.options.map(String) : undefined;
      base.correctIndex = typeof llmItem?.correctIndex === "number" ? llmItem.correctIndex : undefined;
      
      // Use math metadata if available
      if (skItem._meta && Number.isFinite(skItem._meta.expected)) {
        const expected = skItem._meta.expected;
        if (!base.options || base.options.length < 3) {
          base.options = [String(expected), String(expected + 1), String(expected - 1), String(expected + 5)];
        }
        if (!base.options.includes(String(expected))) {
          base.options[0] = String(expected);
        }
        base.correctIndex = base.options.indexOf(String(expected));
      }
      
      normalizeOptionsItem(base);
    } else {
      base.answer = typeof llmItem?.answer === "number" ? llmItem.answer : skItem._meta?.expected;
      normalizeNumericItem(base);
    }
    
    if (skItem._meta) {
      (base as any)._meta = skItem._meta;
    }
    
    return base;
  });
  
  const filledCourse: FilledCourse = {
    ...skeleton,
    studyTexts: filledStudyTexts,
    items: filledItems,
  };
  
  return { ok: true, course: filledCourse };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

function countBlanks(text: string): number {
  const matches = text.match(/\[blank\]/gi);
  return matches ? matches.length : 0;
}

function validateCourse(course: FilledCourse): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // Validate items
  for (const item of course.items) {
    if (item.text === "__FILL__" || item.text.includes("__FILL__")) {
      issues.push({
        code: "unfilled_text",
        severity: "error",
        message: `Item ${item.id} has unfilled text`,
        itemId: item.id,
        field: "text",
      });
      continue;
    }
    
    const blankCount = countBlanks(item.text);
    if (blankCount !== 1) {
      issues.push({
        code: "invalid_blank_count",
        severity: "error",
        message: `Item ${item.id}: Expected exactly 1 [blank], found ${blankCount}`,
        itemId: item.id,
        field: "text",
      });
    }
    
    if (item.mode === "options") {
      if (!item.options || item.options.length < 3 || item.options.length > 4) {
        issues.push({
          code: "invalid_options_count",
          severity: "error",
          message: `Item ${item.id}: options mode requires 3-4 options, found ${item.options?.length || 0}`,
          itemId: item.id,
          field: "options",
        });
      }
      
      if (item.correctIndex === undefined || item.correctIndex === null) {
        issues.push({
          code: "invalid_correct_index",
          severity: "error",
          message: `Item ${item.id}: options mode requires correctIndex`,
          itemId: item.id,
          field: "correctIndex",
        });
      } else if (item.correctIndex < 0 || (item.options && item.correctIndex >= item.options.length)) {
        issues.push({
          code: "invalid_correct_index",
          severity: "error",
          message: `Item ${item.id}: correctIndex ${item.correctIndex} out of range`,
          itemId: item.id,
          field: "correctIndex",
        });
      }
      
      // Math correctness check
      const meta = (item as any)._meta;
      if (meta && item.options && typeof item.correctIndex === "number") {
        const correctOption = item.options[item.correctIndex];
        const correctValue = parseFloat(correctOption);
        if (!isNaN(correctValue) && Math.abs(correctValue - meta.expected) > 0.001) {
          issues.push({
            code: "math_incorrect",
            severity: "error",
            message: `Item ${item.id}: math answer mismatch - expected ${meta.expected}, got ${correctValue}`,
            itemId: item.id,
            field: "correctIndex",
          });
        }
      }
    } else if (item.mode === "numeric") {
      if (item.answer === undefined || typeof item.answer !== "number") {
        issues.push({
          code: "missing_answer",
          severity: "error",
          message: `Item ${item.id}: numeric mode requires answer`,
          itemId: item.id,
          field: "answer",
        });
      }
      
      // Math correctness check
      const meta = (item as any)._meta;
      if (meta && typeof item.answer === "number") {
        if (Math.abs(item.answer - meta.expected) > 0.001) {
          issues.push({
            code: "math_incorrect",
            severity: "error",
            message: `Item ${item.id}: math answer mismatch - expected ${meta.expected}, got ${item.answer}`,
            itemId: item.id,
            field: "answer",
          });
        }
      }
    }
  }
  
  // Validate study texts
  for (const st of course.studyTexts) {
    if (st.content === "__FILL__" || st.content.includes("__FILL__")) {
      issues.push({
        code: "unfilled_content",
        severity: "error",
        message: `Study text ${st.id} has unfilled content`,
        field: "content",
      });
    }
  }
  
  const hasErrors = issues.some(i => i.severity === "error");
  
  return {
    valid: !hasErrors,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

function readState(payload: Record<string, unknown>): JobState {
  const stepRaw = safeString(payload.step, "init").toLowerCase();
  const step: JobStep = ["skeleton", "fill", "validate", "persist", "done"].includes(stepRaw) 
    ? (stepRaw as JobStep) 
    : "init";
  
  const gradeRaw = safeString(payload.grade, "");
  return {
    step,
    courseId: safeString(payload.course_id || payload.courseId, ""),
    subject: safeString(payload.subject, ""),
    grade: gradeRaw || null,
    gradeBand: safeString(payload.grade_band || payload.gradeBand, "All Grades"),
    mode: (payload.mode === "numeric" ? "numeric" : "options") as "options" | "numeric",
    itemsPerGroup: safeNumber(payload.items_per_group || payload.itemsPerGroup, 12),
    levelsCount: safeNumber(payload.levels_count || payload.levelsCount, 3),
    studyTextsCount: safeNumber(payload.study_texts_count || payload.studyTextsCount, 2),
    notes: safeString(payload.notes, "") || undefined,
    title: safeString(payload.title, "") || undefined,
    skeleton: isRecord(payload.skeleton) ? payload.skeleton as any : undefined,
    filledCourse: isRecord(payload.filledCourse) ? payload.filledCourse as any : undefined,
    fillAttempts: safeNumber(payload.fillAttempts, 0),
    validationAttempts: safeNumber(payload.validationAttempts, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor
// ─────────────────────────────────────────────────────────────────────────────

export class AiCourseGenerate implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { payload, jobId } = context;
    const p = isRecord(payload) ? payload : {};
    const organizationId = safeString(p.organization_id, "").trim();
    
    if (!organizationId) {
      throw new Error("BLOCKED: Missing organization_id");
    }
    
    const state = readState(p);
    
    if (!state.subject) {
      throw new Error("BLOCKED: Missing subject for course generation");
    }
    
    const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const LLM_TIMEOUT_MS = parseIntEnv("QUEUE_PUMP_LLM_TIMEOUT_MS", 180_000, 30_000, 600_000);
    
    const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP: init → skeleton
    // ─────────────────────────────────────────────────────────────────────────
    if (state.step === "init") {
      await emitAgentJobEvent(jobId, "generating", 5, "Initializing course generation", { step: "init" }).catch(() => {});
      
      return {
        yield: true,
        message: "Building course skeleton",
        payloadPatch: {
          step: "skeleton",
          fillAttempts: 0,
          validationAttempts: 0,
        },
      };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP: skeleton → fill
    // ─────────────────────────────────────────────────────────────────────────
    if (state.step === "skeleton") {
      await emitAgentJobEvent(jobId, "generating", 15, "Building course skeleton", { step: "skeleton" }).catch(() => {});
      
      const skeleton = buildSkeleton({
        subject: state.subject,
        grade: state.grade,
        itemsPerGroup: state.itemsPerGroup,
        levelsCount: state.levelsCount,
        mode: state.mode,
        studyTextsCount: state.studyTextsCount,
        notes: state.notes,
      });
      
      // Override course ID if provided
      if (state.courseId) {
        skeleton.id = state.courseId;
      }
      if (state.title) {
        skeleton.title = state.title;
      }
      if (state.gradeBand) {
        skeleton.gradeBand = state.gradeBand;
      }
      
      await emitAgentJobEvent(jobId, "generating", 25, "Skeleton built; starting LLM fill", {
        step: "skeleton",
        itemCount: skeleton.items.length,
        groupCount: skeleton.groups.length,
        studyTextCount: skeleton.studyTexts.length,
      }).catch(() => {});
      
      return {
        yield: true,
        message: "Skeleton ready; filling content with LLM",
        payloadPatch: {
          step: "fill",
          skeleton,
        },
      };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP: fill → validate
    // ─────────────────────────────────────────────────────────────────────────
    if (state.step === "fill") {
      const attempt = (state.fillAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "generating", 35, `Filling content with LLM (attempt ${attempt})`, {
        step: "fill",
        attempt,
      }).catch(() => {});
      
      if (!state.skeleton) {
        throw new Error("BLOCKED: Missing skeleton for fill step");
      }
      
      try {
        const fillResult = await fillSkeleton(state.skeleton, LLM_TIMEOUT_MS);
        
        if (!fillResult.ok) {
          if (attempt < 3) {
            await emitAgentJobEvent(jobId, "generating", 40, `Fill failed: ${fillResult.error}; retrying`, {
              step: "fill",
              attempt,
              error: fillResult.error,
            }).catch(() => {});
            
            return {
              yield: true,
              message: `Fill failed: ${fillResult.error}; retrying via requeue`,
              payloadPatch: { fillAttempts: attempt },
            };
          }
          throw new Error(`llm_fill_failed: ${fillResult.error}`);
        }
        
        await emitAgentJobEvent(jobId, "generating", 60, "Content filled; validating course", {
          step: "fill",
        }).catch(() => {});
        
        return {
          yield: true,
          message: "Course filled; proceeding to validation",
          payloadPatch: {
            step: "validate",
            filledCourse: fillResult.course,
            fillAttempts: attempt,
          },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < 3 && (msg.includes("timeout") || msg.includes("timed out"))) {
          return {
            yield: true,
            message: "Fill timed out; retrying via requeue",
            payloadPatch: { fillAttempts: attempt },
          };
        }
        throw e;
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP: validate → persist
    // ─────────────────────────────────────────────────────────────────────────
    if (state.step === "validate") {
      const attempt = (state.validationAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "validating", 70, `Validating course (attempt ${attempt})`, {
        step: "validate",
        attempt,
      }).catch(() => {});
      
      if (!state.filledCourse) {
        throw new Error("BLOCKED: Missing filledCourse for validate step");
      }
      
      const validationResult = validateCourse(state.filledCourse);
      
      if (!validationResult.valid) {
        const errorCount = validationResult.issues.filter(i => i.severity === "error").length;
        const codes = validationResult.issues
          .filter(i => i.severity === "error")
          .slice(0, 5)
          .map(i => i.code)
          .join(",");
        
        if (attempt < 2) {
          // Try to fix issues and re-fill
          await emitAgentJobEvent(jobId, "repairing", 75, `Validation failed (${errorCount} errors); attempting repair`, {
            step: "validate",
            attempt,
            errorCount,
            codes,
          }).catch(() => {});
          
          return {
            yield: true,
            message: `Validation failed; re-filling to repair`,
            payloadPatch: {
              step: "fill",
              validationAttempts: attempt,
              fillAttempts: 0,
            },
          };
        }
        
        throw new Error(`validation_failed: ${errorCount} errors | codes=${codes}`);
      }
      
      await emitAgentJobEvent(jobId, "validating", 80, "Validation passed; persisting course", {
        step: "validate",
        issueCount: validationResult.issues.length,
      }).catch(() => {});
      
      return {
        yield: true,
        message: "Validation passed; persisting to storage",
        payloadPatch: {
          step: "persist",
          validationAttempts: attempt,
        },
      };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP: persist → done
    // ─────────────────────────────────────────────────────────────────────────
    if (state.step === "persist") {
      await emitAgentJobEvent(jobId, "storage_write", 85, "Persisting course to storage", {
        step: "persist",
      }).catch(() => {});
      
      if (!state.filledCourse) {
        throw new Error("BLOCKED: Missing filledCourse for persist step");
      }
      
      const course = state.filledCourse;
      const courseId = course.id;
      
      if (!courseId) {
        throw new Error("BLOCKED: Course is missing id");
      }
      
      // Upload course JSON to storage
      const coursePath = `${courseId}/course.json`;
      const courseBlob = new Blob([JSON.stringify(course, null, 2)], { type: "application/json" });
      
      const { error: uploadError } = await adminSupabase.storage
        .from("courses")
        .upload(coursePath, courseBlob, {
          upsert: true,
          contentType: "application/json",
          cacheControl: "public, max-age=60",
        });
      
      if (uploadError) {
        throw new Error(`storage_upload_failed: ${uploadError.message}`);
      }
      
      // Upsert course metadata
      const metadata = {
        course_id: courseId,
        organization_id: organizationId,
        title: course.title,
        subject: course.subject,
        grade_band: course.gradeBand,
        content_version: course.contentVersion,
        visibility: "draft",
        item_count: course.items.length,
        group_count: course.groups.length,
        level_count: course.levels.length,
        updated_at: new Date().toISOString(),
      };
      
      const { error: metaError } = await adminSupabase
        .from("course_metadata")
        .upsert(metadata, { onConflict: "course_id" });
      
      if (metaError) {
        console.warn(`[ai_course_generate] Metadata upsert warning: ${metaError.message}`);
        // Non-fatal - course is saved, metadata is best-effort
      }
      
      await emitAgentJobEvent(jobId, "done", 100, "Course generation complete", {
        step: "done",
        courseId,
        itemCount: course.items.length,
      }).catch(() => {});
      
      return {
        ok: true,
        jobId,
        courseId,
        coursePath,
        itemCount: course.items.length,
        groupCount: course.groups.length,
        studyTextCount: course.studyTexts.length,
        source: "skeleton+llm",
      };
    }
    
    throw new Error(`Invalid job state: unknown step '${state.step}'`);
  }
}
