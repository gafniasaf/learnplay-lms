// supabase/functions/_shared/gates.ts
// Shared knowledge-pack gates (lexicon, banned terms, readability)

export type BasicKnowledgePack = {
  pack_id: string;
  topic: string;
  grade: number | string;
  version: number;
  allowed_vocab: {
    content: string[];
    function: string[];
  };
  banned_terms: string[];
  reading_level_max: number;
};

const FUNCTION_WORDS = new Set<string>([
  "a", "an", "the", "in", "on", "of", "and", "to", "for", "is", "it", "that",
  "so", "very", "can", "your", "you", "are", "they", "have", "this", "these",
  "our", "we",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function checkLexicon(text: string, pack: BasicKnowledgePack): boolean {
  const allowed = new Set<string>([
    ...pack.allowed_vocab.content,
    ...pack.allowed_vocab.function,
  ]);
  const tokens = tokenize(text);
  for (const token of tokens) {
    if (allowed.has(token) || FUNCTION_WORDS.has(token)) continue;
    return false;
  }
  return true;
}

export function checkBanned(text: string, pack: BasicKnowledgePack): boolean {
  const lower = text.toLowerCase();
  return !pack.banned_terms.some((term) =>
    lower.includes(term.toLowerCase())
  );
}

function averageWordsPerSentence(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return 0;
  const totalWords = sentences
    .map((sentence) => sentence.split(/\s+/).filter(Boolean).length)
    .reduce((sum, count) => sum + count, 0);
  return totalWords / sentences.length;
}

export function checkReadability(text: string, pack: BasicKnowledgePack): boolean {
  const avgWords = averageWordsPerSentence(text);
  const maxWords = Math.max(6, Math.min(12, Math.round(pack.reading_level_max * 6)));
  return avgWords <= maxWords;
}

export interface GateIssue {
  code: "lexicon" | "banned_term" | "readability";
  path: string;
  message: string;
}

export function evaluateKnowledgePackGates(
  course: { studyTexts?: Array<{ id: string; content: string }> },
  pack: BasicKnowledgePack,
): GateIssue[] {
  const issues: GateIssue[] = [];
  const studyTexts = Array.isArray(course.studyTexts) ? course.studyTexts : [];

  for (const st of studyTexts) {
    const content = String(st?.content || "");
    const path = `studyTexts[${st.id ?? "unknown"}].content`;

    if (!checkBanned(content, pack)) {
      issues.push({
        code: "banned_term",
        path,
        message: "Study text contains banned terms from the knowledge pack.",
      });
    }
    if (!checkLexicon(content, pack)) {
      issues.push({
        code: "lexicon",
        path,
        message: "Study text uses vocabulary outside the allowed lexicon.",
      });
    }
    if (!checkReadability(content, pack)) {
      issues.push({
        code: "readability",
        path,
        message: "Study text exceeds the target readability for this grade.",
      });
    }
  }

  return issues;
}

