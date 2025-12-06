// supabase/functions/_shared/prompts.ts
// Prompt builders for course generation

export interface CoursePromptConfig {
  subject: string;
  grade: string;
  itemsPerGroup: number;
  levelsCount?: number;
  mode: "options" | "numeric";
  sources?: Array<{ url: string; content: string; title?: string }>;
}

/**
 * Build the main course generation prompt
 */
export function buildCoursePrompt(config: CoursePromptConfig): string {
  const { subject, grade, itemsPerGroup, levelsCount = 3, mode, sources } = config;
  
  let prompt = `Generate an educational course for the following specifications:

SUBJECT: ${subject}
GRADE LEVEL: ${grade}
ITEMS PER GROUP: ${itemsPerGroup}
NUMBER OF LEVELS: ${levelsCount}
ANSWER MODE: ${mode}

REQUIREMENTS:
1. Create appropriate groups/topics for the subject
2. Generate ${itemsPerGroup} practice items per group
3. Each item must have EXACTLY one [blank] placeholder
4. Items should progress from easier to harder within each level

`;

  if (mode === "options") {
    prompt += `
ANSWER FORMAT (options mode):
- Each item needs 3-4 answer options
- Include one correct answer and 2-3 plausible distractors
- Set correctIndex to the position of the correct answer (0-based)
- Example: { "options": ["Paris", "London", "Berlin", "Madrid"], "correctIndex": 0 }
`;
  } else {
    prompt += `
ANSWER FORMAT (numeric mode):
- Each item needs a numeric answer
- Do NOT include options array
- Set answer to the correct numeric value
- Example: { "answer": 42 }
`;
  }

  prompt += `
STUDY TEXTS:
- Include 2-4 study texts with educational content
- Use [SECTION:Title] markers to organize content
- Use [IMAGE:description] where visuals would help
- Keep language appropriate for ${grade}

`;

  // Add source content if provided
  if (sources && sources.length > 0) {
    prompt += `
REFERENCE SOURCES (use these for accuracy):
`;
    for (const source of sources) {
      prompt += `
--- ${source.title || source.url} ---
${source.content.slice(0, 2000)}
---
`;
    }
  }

  prompt += `
OUTPUT FORMAT:
Return a valid JSON object matching the Course v2 schema with:
- id: course identifier
- title: course title
- subject: "${subject}"
- gradeBand: "${grade}"
- contentVersion: version string
- groups: array of { id, name }
- levels: array of { id, title, start, end }
- studyTexts: array of { id, title, order, content }
- items: array of course items

Output ONLY the JSON, no markdown code blocks or explanations.
`;

  return prompt;
}

/**
 * Build prompt for filling skeleton content
 */
export function buildFillerPrompt(skeleton: any): string {
  return `Fill in the following course skeleton with educational content.

SKELETON:
${JSON.stringify(skeleton, null, 2)}

RULES:
1. Keep all IDs, groupIds, clusterIds, variants, and modes unchanged
2. Fill in item.text with clear questions/statements containing exactly one [blank]
3. Fill in studyTexts.content with educational material
4. For options mode: provide options array and correctIndex
5. For numeric mode: provide answer value
6. Match the grade level and subject appropriately

Return ONLY the filled JSON, no explanations.`;
}

/**
 * Build prompt for self-review
 */
export function buildReviewPrompt(course: any, config: { grade: string }): string {
  return `Review this educational course for quality.

COURSE:
${JSON.stringify(course, null, 2)}

GRADE LEVEL: ${config.grade}

Evaluate and return JSON with:
{
  "overall": 0.0-1.0,
  "clarity": 0.0-1.0,
  "age_fit": 0.0-1.0,
  "correctness": 0.0-1.0,
  "notes": "brief critique"
}

Be critical but fair. Focus on:
- Are questions clear and unambiguous?
- Is content age-appropriate?
- Are answers factually correct?

Return ONLY the JSON evaluation.`;
}
