// supabase/functions/_shared/candidates.ts
// Candidate-based course generation helpers

import { generateJson, getProvider, getModel, type LLMCallMetrics } from "./ai.ts";
import { CourseSchema } from "./validation.ts";
import { buildCoursePrompt } from "./prompts.ts";
import { countPlaceholders, extractJsonFromText as extractJsonFromTextShared } from "./generation-utils.ts";
import { logInfo, logWarn } from "./log.ts";

export interface CandidateGenerationConfig {
  subject: string;
  grade: string;
  itemsPerGroup: number;
  levelsCount?: number;
  mode: "options" | "numeric";
  sources?: Array<{ url: string; content: string; title?: string }>;
}

export interface Candidate {
  course: any;
  index: number;
  raw?: string;
}

export interface SelfReviewResult {
  overall: number;
  clarity: number;
  age_fit: number;
  correctness: number;
  notes: string;
}

export interface ScoringResult {
  score: number;
  issues: string[];
  details: {
    schema_valid: boolean;
    placeholder_valid: boolean;
    mode_constraints_valid: boolean;
    consistency_score: number;
    self_review_score?: number;
  };
}

/**
 * Compute cosine similarity between two text strings (simple bag-of-words)
 */
function cosineSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().match(/\b\w+\b/g) || [];
  const words2 = text2.toLowerCase().match(/\b\w+\b/g) || [];
  
  const vocab = new Set([...words1, ...words2]);
  const vec1: number[] = [];
  const vec2: number[] = [];
  
  for (const word of vocab) {
    vec1.push(words1.filter(w => w === word).length);
    vec2.push(words2.filter(w => w === word).length);
  }
  
  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Extract concatenated text from course items and study texts for similarity checking
 */
function extractCourseText(course: any): string {
  const parts: string[] = [];
  
  if (Array.isArray(course.items)) {
    parts.push(...course.items.map((item: any) => item.text || ''));
  }
  
  if (Array.isArray(course.studyTexts)) {
    parts.push(...course.studyTexts.map((st: any) => st.content || ''));
  }
  
  return parts.join(' ');
}

/**
 * Generate K candidate courses in parallel with diversity constraints
 * Returns array of successfully parsed candidates
 */
export async function generateCandidates(
  config: CandidateGenerationConfig,
  k: number,
  ctx: any,
  timeoutMs = 110000
): Promise<{ candidates: Candidate[]; metrics: LLMCallMetrics[] }> {
  const { subject, grade, itemsPerGroup, levelsCount, mode, sources } = config;
  
  logInfo("Generating candidates in parallel", { ...ctx, k, subject, grade, mode });
  
  // Build base prompt
  const basePrompt = buildCoursePrompt({
    subject,
    grade,
    itemsPerGroup,
    levelsCount,
    mode,
    sources
  });
  
  // Diversity instructions
  const diversityInstruction = `\n\nIMPORTANT - DIVERSITY CONSTRAINT:
Each candidate must follow a DIFFERENT reasoning path, structure, tone, and explanation strategy. 
Vary your approach significantly:
- Candidate 1: Use formal academic language with technical terminology
- Candidate 2: Use conversational, everyday language with practical examples
- Candidate 3: Use visual/spatial metaphors and story-based explanations
- Vary the order of groups, the phrasing of questions, and the selection of examples
- Use different pedagogical approaches (inductive vs deductive, concrete vs abstract)
`;
  
  const systemPrompt = "You are an expert educational content creator. Generate valid JSON matching the Course v2 schema exactly. Output only JSON, no markdown.";
  
  // Generate candidates in parallel with varied parameters
  const candidatePromises = Array.from({ length: k }, (_, index) => {
    // Vary temperature and seed per candidate for diversity
    const temperature = 0.2 + (index * 0.1); // 0.2, 0.3, 0.4...
    const seed = Date.now() + index;
    
    const styleHint = index === 0 
      ? "\nStyle: Formal and academic" 
      : index === 1 
      ? "\nStyle: Conversational and practical"
      : "\nStyle: Visual and story-based";
    
    const fullPrompt = `${basePrompt}${diversityInstruction}${styleHint}\n\nCandidate #${index + 1}`;
    
    return generateJson({
      system: systemPrompt,
      prompt: fullPrompt,
      maxTokens: 4500,
      temperature,
      stopSequences: ["```", "\n\nHuman:"],
      prefillJson: true,
      timeoutMs
    });
  });
  
  const results = await Promise.all(candidatePromises);
  const candidates: Candidate[] = [];
  const metrics: LLMCallMetrics[] = [];
  
  // Parse and collect successful candidates
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    
    if (result.metrics) {
      metrics.push(result.metrics);
    }
    
    if (!result.ok) {
      logWarn("Candidate generation failed", { ...ctx, candidateIndex: i, error: result.error });
      continue;
    }
    
    try {
      const parsed = extractJsonFromTextShared(result.text);
      candidates.push({ course: parsed, index: i, raw: result.text });
    } catch (e) {
      logWarn("Candidate JSON parse failed", { ...ctx, candidateIndex: i, error: String(e) });
    }
  }
  
  // Check diversity: if candidates are too similar, log warning
  if (candidates.length >= 2) {
    for (let i = 0; i < candidates.length - 1; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const text1 = extractCourseText(candidates[i].course);
        const text2 = extractCourseText(candidates[j].course);
        const similarity = cosineSimilarity(text1, text2);
        
        if (similarity > 0.85) {
          logWarn("Candidates too similar", { 
            ...ctx, 
            candidate1: i, 
            candidate2: j, 
            similarity: similarity.toFixed(2) 
          });
        }
      }
    }
  }
  
  logInfo("Candidate generation completed", { 
    ...ctx, 
    requested: k, 
    succeeded: candidates.length,
    avgTokens: metrics.reduce((sum, m) => sum + (m.tokens || 0), 0) / metrics.length
  });
  
  return { candidates, metrics };
}

/**
 * Self-review a single candidate using LLM
 * Returns scores and notes
 */
export async function selfReviewCandidate(
  candidate: any,
  config: CandidateGenerationConfig,
  ctx: any,
  timeoutMs = 30000
): Promise<SelfReviewResult | null> {
  const { subject, grade } = config;
  
  const prompt = `Review this educational course for quality. Return ONLY valid JSON with scores (0-1) and brief notes.

Course subject: ${subject}
Grade level: ${grade}

Schema:
{
  "overall": 0.8,
  "clarity": 0.9,
  "age_fit": 0.85,
  "correctness": 0.8,
  "notes": "Brief critique summary"
}

Scoring guidelines:
- clarity: Are questions clear and unambiguous?
- age_fit: Is vocabulary/difficulty appropriate for grade ${grade}?
- correctness: Are answers factually correct?
- overall: Weighted average

Course JSON:
${JSON.stringify(candidate, null, 2)}`;
  
  try {
    const result = await generateJson({
      system: "You are an educational quality reviewer. Return only JSON.",
      prompt,
      maxTokens: 1200,
      temperature: 0.2,
      prefillJson: true,
      timeoutMs
    });
    
    if (!result.ok) {
      logWarn("Self-review failed", { ...ctx, error: result.error });
      return null;
    }
    
    const parsed = JSON.parse(result.text);
    return {
      overall: parsed.overall || 0.5,
      clarity: parsed.clarity || 0.5,
      age_fit: parsed.age_fit || 0.5,
      correctness: parsed.correctness || 0.5,
      notes: parsed.notes || ""
    };
  } catch (e) {
    logWarn("Self-review exception", { ...ctx, error: String(e) });
    return null;
  }
}

/**
 * Score a candidate using deterministic checks + consistency metrics
 */
export function scoreCandidate(
  candidate: any,
  mode: "options" | "numeric",
  selfReview: SelfReviewResult | null,
  ctx: any
): ScoringResult {
  const issues: string[] = [];
  let schemaValid = false;
  let placeholderValid = true;
  let modeConstraintsValid = true;
  let consistencyScore = 1.0;
  
  // 1. Schema validation
  try {
    CourseSchema.parse(candidate);
    schemaValid = true;
  } catch (e: any) {
    schemaValid = false;
    if (e.errors) {
      issues.push(...e.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`));
    } else {
      issues.push(String(e));
    }
  }
  
  // 2. Placeholder validation
  if (Array.isArray(candidate.items)) {
    for (const item of candidate.items) {
      const count = countPlaceholders(item.text || "");
      if (count !== 1) {
        placeholderValid = false;
        issues.push(`Item ${item.id}: invalid placeholder count (${count})`);
      }
    }
  }
  
  // 3. Mode constraints
  if (Array.isArray(candidate.items)) {
    for (const item of candidate.items) {
      const itemMode = item.mode || mode;
      if (itemMode === "options") {
        if (!Array.isArray(item.options) || item.options.length < 3 || item.options.length > 4) {
          modeConstraintsValid = false;
          issues.push(`Item ${item.id}: options mode requires 3-4 options`);
        }
        if (typeof item.correctIndex !== "number" || item.correctIndex < 0) {
          modeConstraintsValid = false;
          issues.push(`Item ${item.id}: options mode requires valid correctIndex`);
        }
      } else if (itemMode === "numeric") {
        if (typeof item.answer !== "number") {
          modeConstraintsValid = false;
          issues.push(`Item ${item.id}: numeric mode requires answer`);
        }
        if (item.options !== undefined) {
          modeConstraintsValid = false;
          issues.push(`Item ${item.id}: numeric mode must not have options`);
        }
      }
    }
  }
  
  // 4. Consistency checks
  if (Array.isArray(candidate.items) && candidate.items.length > 0) {
    // Item length uniformity
    const lengths = candidate.items.map((item: any) => (item.text || "").length);
    const meanLength = lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum: number, len: number) => sum + Math.pow(len - meanLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = meanLength > 0 ? stdDev / meanLength : 0;
    
    if (coefficientOfVariation > 0.8) {
      consistencyScore *= 0.9;
      issues.push("Item length uniformity: high variation");
    }
    
    // Check for empty or placeholder-only items
    for (const item of candidate.items) {
      const text = (item.text || "").trim();
      if (text.length === 0) {
        consistencyScore *= 0.8;
        issues.push(`Item ${item.id}: empty text`);
      }
      
      // Check for placeholder-only (just the blank marker, no meaningful content)
      const withoutBlanks = text.replace(/\[blank\]/g, '').replace(/_/g, '').trim();
      if (withoutBlanks.length < 3) {
        consistencyScore *= 0.8;
        issues.push(`Item ${item.id}: placeholder-only, no real content`);
      }
    }
    
    // Hallucination checks (for math: operation mismatch)
    if (mode === "numeric") {
      for (const item of candidate.items) {
        const text = item.text || "";
        // Detect math operations
        const hasAdd = /\+/.test(text);
        const hasSub = /[-−]/.test(text);
        const hasMul = /[×*]/.test(text);
        const hasDiv = /[÷/]/.test(text);
        
        if (hasAdd || hasSub || hasMul || hasDiv) {
          // Try to extract operands
          const match = text.match(/([\d.]+)\s*([+\-−×*÷/])\s*([\d.]+)/);
          if (match) {
            const a = parseFloat(match[1]);
            const op = match[2];
            const b = parseFloat(match[3]);
            const expected = op === '+' ? a + b 
              : op === '-' || op === '−' ? a - b 
              : op === '×' || op === '*' ? a * b 
              : op === '÷' || op === '/' ? a / b 
              : NaN;
            
            if (!isNaN(expected) && Math.abs(expected - (item.answer || 0)) > 0.01) {
              consistencyScore *= 0.7;
              issues.push(`Item ${item.id}: math operation mismatch (expected ${expected.toFixed(2)}, got ${item.answer})`);
            }
          }
        }
      }
    }
    
    // For options mode: check for duplicate options
    if (mode === "options") {
      for (const item of candidate.items) {
        if (Array.isArray(item.options)) {
          const unique = new Set(item.options);
          if (unique.size < item.options.length) {
            consistencyScore *= 0.8;
            issues.push(`Item ${item.id}: duplicate options`);
          }
        }
      }
    }
  }
  
  // 5. Combine deterministic score with self-review
  let baseScore = 0.0;
  
  if (schemaValid) baseScore += 0.3;
  if (placeholderValid) baseScore += 0.2;
  if (modeConstraintsValid) baseScore += 0.2;
  baseScore += consistencyScore * 0.15;
  
  // Add self-review component (15% weight)
  if (selfReview) {
    baseScore += selfReview.overall * 0.15;
  }
  
  const finalScore = Math.max(0, Math.min(1, baseScore));
  
  return {
    score: finalScore,
    issues,
    details: {
      schema_valid: schemaValid,
      placeholder_valid: placeholderValid,
      mode_constraints_valid: modeConstraintsValid,
      consistency_score: consistencyScore,
      self_review_score: selfReview?.overall
    }
  };
}

/**
 * Select best candidate from scored candidates
 * Returns null if all candidates fail minimum viable score
 */
export function selectBestCandidate(
  candidates: Candidate[],
  scores: ScoringResult[],
  minViableScore: number,
  ctx: any
): { candidate: Candidate; score: ScoringResult } | null {
  if (candidates.length === 0 || scores.length === 0) {
    logWarn("No candidates to select from", ctx);
    return null;
  }
  
  // Find best score
  let bestIndex = 0;
  let bestScore = scores[0].score;
  
  for (let i = 1; i < scores.length; i++) {
    if (scores[i].score > bestScore) {
      bestScore = scores[i].score;
      bestIndex = i;
    }
  }
  
  // Check if best meets minimum viable score
  if (bestScore < minViableScore) {
    logWarn("Best candidate below minimum viable score", { 
      ...ctx, 
      bestScore: bestScore.toFixed(2), 
      minViableScore 
    });
    return null;
  }
  
  logInfo("Best candidate selected", { 
    ...ctx, 
    candidateIndex: bestIndex, 
    score: bestScore.toFixed(2) 
  });
  
  return {
    candidate: candidates[bestIndex],
    score: scores[bestIndex]
  };
}
