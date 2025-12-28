// supabase/functions/_shared/skeleton.ts
// Skeleton builder for course generation

export interface SkeletonParams {
  format?: string;
  subject: string;
  grade: string | null;
  itemsPerGroup: number;
  levelsCount?: number;
  mode: "options" | "numeric";
  sources?: Array<{ url: string; content: string; title?: string }>;
  studyTextsCount?: number;
  notes?: string;
}

export interface MathMeta {
  op: "add" | "sub" | "mul" | "div";
  a: number;
  b: number;
  expected: number;
}

export interface SkeletonItem {
  id: number;
  text: string;
  groupId: number;
  clusterId: string;
  variant: "1" | "2" | "3";
  mode: "options" | "numeric";
  _meta?: MathMeta;
}

export interface SkeletonStudyText {
  id: string;
  title: string;
  order: number;
  content: string;
}

export interface SkeletonGroup {
  id: number;
  name: string;
}

export interface SkeletonLevel {
  id: number;
  title: string;
  start: number;
  end: number;
}

export interface SkeletonCourse {
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

// Detect math operations from subject
function detectMathOps(subject: string): Array<"add" | "sub" | "mul" | "div"> {
  const s = subject.toLowerCase();
  const ops: Array<"add" | "sub" | "mul" | "div"> = [];
  
  if (s.includes("add") || s.includes("plus") || s.includes("sum")) ops.push("add");
  if (s.includes("sub") || s.includes("minus") || s.includes("difference")) ops.push("sub");
  if (s.includes("mult") || s.includes("times") || s.includes("product")) ops.push("mul");
  if (s.includes("div") || s.includes("quotient")) ops.push("div");
  
  // Generic "math" gets addition
  if (ops.length === 0 && s.includes("math")) ops.push("add");
  
  return ops;
}

// Deterministic pseudo-random based on seed
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Generate math metadata for an item
function generateMathMeta(
  op: "add" | "sub" | "mul" | "div",
  itemId: number,
  grade: string | null
): MathMeta {
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
      a = b * expected; // Ensure clean division
      break;
    default:
      a = 1; b = 1; expected = 2;
  }
  
  return { op, a, b, expected };
}

// Capitalize first letter
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Sanitize ID
function sanitizeId(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeClusterId(groupName: string, groupId: number, clusterIndex: number): string {
  const baseRaw = sanitizeId(groupName);
  const prefix = `g${groupId}-`;
  const suffix = `-cluster-${clusterIndex}`;

  // Course schema constrains clusterId max length to 64 characters.
  // Ensure we never exceed it, even for long subjects/group names.
  const maxBaseLen = Math.max(1, 64 - prefix.length - suffix.length);
  let base = baseRaw.length > maxBaseLen ? baseRaw.slice(0, maxBaseLen) : baseRaw;
  base = base.replace(/-+$/g, "");
  if (!base) base = `group-${groupId}`;

  const out = `${prefix}${base}${suffix}`;
  return out.length > 64 ? out.slice(0, 64) : out;
}

// Build groups from subject
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
  
  // Non-math: always create 3 subject-specific groups so the LLM has strong topical anchors.
  // This avoids the model defaulting to generic math content for "Basics/Practice".
  const topic = capitalize(subject.trim()) || "Topic";
  return [
    { id: 0, name: `${topic}: Foundations` },
    { id: 1, name: `${topic}: Key Concepts` },
    { id: 2, name: `${topic}: Applications` },
  ];
}

// Build skeleton course
export function buildSkeleton(params: SkeletonParams): SkeletonCourse {
  const { subject, grade, itemsPerGroup, levelsCount = 3, mode } = params;
  
  const groups = buildGroups(subject);
  const mathOps = detectMathOps(subject);
  const isMath = mathOps.length > 0;
  
  // Generate items
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
  
  // Generate levels
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
  
  // Generate study texts
  const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(n)));
  const requestedStudyTextsCount =
    typeof params.studyTextsCount === "number" && Number.isFinite(params.studyTextsCount)
      ? clampInt(params.studyTextsCount, 1, 12)
      : null;
  const desiredStudyTextsCount = requestedStudyTextsCount ?? 2;

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

  // Always start with an intro.
  pushStudyText("study-intro", "Introduction");

  // Use group names as topical anchors when possible.
  for (const g of groups) {
    if (studyTexts.length >= desiredStudyTextsCount) break;
    pushStudyText(`study-group-${g.id}`, g.name);
  }

  // Common extras to reach desired count.
  const extras: Array<{ id: string; title: string }> = [
    { id: "study-key-concepts", title: "Key Concepts" },
    { id: "study-examples", title: "Worked Examples" },
    { id: "study-misconceptions", title: "Common Misconceptions" },
    { id: "study-practice", title: "Practice & Review" },
  ];
  for (const ex of extras) {
    if (studyTexts.length >= desiredStudyTextsCount) break;
    pushStudyText(ex.id, ex.title);
  }

  // If we still need more, add generic extra topics.
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
