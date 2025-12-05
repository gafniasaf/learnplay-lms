// supabase/functions/_shared/deterministic.ts
// Deterministic course compiler based on curated knowledge packs.

import { CourseSchema } from "./validation.ts";
import { logInfo, logWarn } from "./log.ts";
import { evaluateKnowledgePackGates, BasicKnowledgePack } from "./gates.ts";

export interface KnowledgePack extends BasicKnowledgePack {
  locale?: string;
  tags?: string[];
  learning_goals: string[];
  canonical_facts: { id: string; text: string }[];
  sections: string[];
  section_goal_map?: Record<string, string[]>;
  section_templates: Record<string, string[]>;
  item_blueprint: {
    groups: string[];
    items_per_group: number;
    levels: number;
  };
  cloze_templates: {
    id: string;
    template: string;
    answer: string;
    distractor_set: string;
  }[];
  distractors: Record<string, string[]>;
}

export interface DeterministicParams {
  format?: string;
  subject: string;
  grade: string | null;
  itemsPerGroup?: number;
  levelsCount?: number;
  mode: "options" | "numeric";
}

export interface DeterministicResult {
  success: boolean;
  course?: any;
  knowledgePack?: KnowledgePack;
  packId?: string;
  packVersion?: number;
  seed?: number;
  errors?: string[];
}

const FUNCTION_WORDS = new Set<string>(["a","an","the","in","on","of","and","to","for","is","it","that","so","very","can","your","you","are","they","have","this","these","our","we"]);

function mulberry32(seed: number): () => number {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

function slugifyTopic(subject: string): string {
  return subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
}

function normalizeGrade(grade: string | null): { numeric?: number; key?: string } {
  if (!grade) return {};
  const digits = grade.match(/\d+/);
  if (!digits) return {};
  const num = parseInt(digits[0], 10);
  if (Number.isNaN(num)) return {};
  return { numeric: num, key: `g${num}` };
}

async function readPackFile(fileName: string): Promise<KnowledgePack | null> {
  try {
    const packsDir = Deno.env.get("PACKS_DIR") || "content/packs";
    const url = new URL(`../../../${packsDir}/${fileName}`, import.meta.url);
    const text = await Deno.readTextFile(url);
    const json = JSON.parse(text);
    return json as KnowledgePack;
  } catch (_err) {
    return null;
  }
}

async function loadKnowledgePack(subject: string, grade: string | null): Promise<KnowledgePack | null> {
  const topicSlug = (() => {
    const s = subject.toLowerCase();
    if (s.includes("kidney")) return "kidneys"; // common case
    return slugifyTopic(subject);
  })();

  const g = normalizeGrade(grade);
  const candidates: string[] = [];

  if (g.key) {
    candidates.push(`${topicSlug}.${g.key}.json`);
  }
  // Fallback: topic only
  candidates.push(`${topicSlug}.json`);

  for (const name of candidates) {
    const pack = await readPackFile(name);
    if (pack) return pack;
  }

  return null;
}

function ensureSingleBlank(text: string): boolean {
  const matches = text.match(/\[blank\]/g) || [];
  return matches.length === 1;
}

function buildStudyTexts(pack: KnowledgePack): any[] {
  const studyTexts: any[] = [];

  pack.sections.forEach((section, index) => {
    const templates = pack.section_templates[section] || [];
    if (!templates.length) return;
    const title = section
      .split(/[_-]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");

    const body = templates.join("\n\n");
    studyTexts.push({
      id: `section-${section}`,
      title,
      order: index + 1,
      content: `[SECTION:${title}]\n${body}`
    });
  });

  return studyTexts;
}

function buildClozeItems(pack: KnowledgePack, mode: "options" | "numeric", rng: () => number): any[] {
  const items: any[] = [];
  const groups = pack.item_blueprint.groups;
  const itemsPerGroup = pack.item_blueprint.items_per_group;

  let id = 0;
  for (let g = 0; g < groups.length; g++) {
    for (let i = 0; i < itemsPerGroup; i++) {
      const tmpl = pack.cloze_templates[(g * itemsPerGroup + i) % pack.cloze_templates.length];
      const text = tmpl.template;
      if (!ensureSingleBlank(text)) continue;

      const correct = tmpl.answer;
      const pool = (pack.distractors[tmpl.distractor_set] || []).filter(d => d.toLowerCase() !== correct.toLowerCase());
      const options: string[] = [];
      options.push(correct);

      // Sample up to 3 distractors
      const desiredTotal = 3;
      for (let k = 0; k < pool.length && options.length < desiredTotal; k++) {
        const idx = Math.floor(rng() * pool.length);
        const cand = pool[idx];
        if (!options.includes(cand)) options.push(cand);
      }

      // If we still have <3 options, pad with any distinct pool entries
      for (const cand of pool) {
        if (options.length >= desiredTotal) break;
        if (!options.includes(cand)) options.push(cand);
      }

      // Shuffle options
      for (let a = options.length - 1; a > 0; a--) {
        const b = Math.floor(rng() * (a + 1));
        [options[a], options[b]] = [options[b], options[a]];
      }

      const correctIndex = options.findIndex(o => o.toLowerCase() === correct.toLowerCase());
      const item: any = {
        id,
        text,
        groupId: g,
        clusterId: `${tmpl.id}-${id}`,
        variant: String((id % 3) + 1),
        mode,
        options,
        correctIndex
      };

      items.push(item);
      id++;
    }
  }

  return items;
}

function buildGroups(pack: KnowledgePack): any[] {
  return pack.item_blueprint.groups.map((name, idx) => ({ id: idx, name }));
}

function buildLevels(pack: KnowledgePack, items: any[]): any[] {
  const levelCount = Math.max(1, pack.item_blueprint.levels);
  const total = items.length;
  if (!total) return [];
  const span = Math.max(1, Math.floor(total / levelCount));
  const levels: any[] = [];

  for (let i = 0; i < levelCount; i++) {
    const start = i * span;
    const end = i === levelCount - 1 ? total - 1 : Math.min(total - 1, (i + 1) * span - 1);
    levels.push({ id: i + 1, title: `Level ${i + 1}`, start, end });
  }

  return levels;
}

function runGates(course: any, pack: KnowledgePack): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Basic schema validation
    CourseSchema.parse(course);
  } catch (err: any) {
    errors.push("CourseSchema validation failed: " + (err?.message || String(err)));
  }

  const studyGates = evaluateKnowledgePackGates(course, pack);
  for (const issue of studyGates) {
    errors.push(`${issue.code} at ${issue.path}`);
  }

  // Item gates
  const items = Array.isArray(course.items) ? course.items : [];
  for (const it of items) {
    const text = String(it?.text || "");
    if (!ensureSingleBlank(text)) errors.push(`Item ${it.id} has invalid [blank] count`);
  }

  return { ok: errors.length === 0, errors };
}

export async function generateCourseDeterministic(params: DeterministicParams, ctx?: any): Promise<DeterministicResult> {
  const format = params.format ?? "practice";
  if (format !== "practice") {
    return { success: false, errors: [`deterministic_not_supported_for_${format}`] };
  }

  const pack = await loadKnowledgePack(params.subject, params.grade);
  if (!pack) {
    return { success: false, errors: ["no_pack_found"] };
  }

  const seedStr = `${pack.pack_id}|${pack.version}|${params.subject}|${params.grade || ""}|${params.mode}|${format}`;
  const seed = hashString(seedStr);
  const rng = mulberry32(seed);

  const groups = buildGroups(pack);
  const studyTexts = buildStudyTexts(pack);
  const items = buildClozeItems(pack, params.mode, rng);
  const levels = buildLevels(pack, items);

  const courseId = `${slugifyTopic(pack.topic)}-g${pack.grade}`;
  const course = {
    id: courseId,
    title: `${pack.topic.charAt(0).toUpperCase()}${pack.topic.slice(1)} Course`,
    description: `Deterministic course for ${pack.topic}, grade ${pack.grade}.`,
    subject: pack.topic,
    gradeBand: String(pack.grade),
    contentVersion: `det-${new Date().toISOString()}`,
    groups,
    levels,
    studyTexts,
    items
  };

  const gates = runGates(course, pack);
  if (!gates.ok) {
    logWarn("Deterministic course gates failed", { ...(ctx || {}), pack_id: pack.pack_id, errors: gates.errors });
    // Still return the course but surface errors
    return {
      success: true,
      course,
      knowledgePack: pack,
      packId: pack.pack_id,
      packVersion: pack.version,
      seed,
      errors: gates.errors
    };
  }

  logInfo("Deterministic course generated", { ...(ctx || {}), pack_id: pack.pack_id, seed, itemCount: course.items?.length, studyTextCount: course.studyTexts?.length });

  return {
    success: true,
    course,
    knowledgePack: pack,
    packId: pack.pack_id,
    packVersion: pack.version,
    seed,
    errors: []
  };
}
