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
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
  
  // Non-math: create 2-3 generic groups based on subject
  const words = subject.split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 2) {
    return [
      { id: 0, name: capitalize(words[0]) },
      { id: 1, name: capitalize(words[1]) }
    ];
  }
  
  return [
    { id: 0, name: "Basics" },
    { id: 1, name: "Practice" }
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
        clusterId: `${sanitizeId(group.name)}-cluster-${Math.floor(j / 3)}`,
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
  const studyTexts: SkeletonStudyText[] = [
    {
      id: "study-intro",
      title: "Introduction",
      order: 1,
      content: "__FILL__",
    },
    {
      id: "study-concepts",
      title: "Key Concepts",
      order: 2,
      content: "__FILL__",
    },
  ];
  
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
  };
}
