// supabase/functions/_shared/prompts.ts
// Dawn-style modular prompt templates for AI course generation.
// NOTE: Model selection is controlled via env (AI_PROVIDER / ANTHROPIC_MODEL / OPENAI_COURSE_MODEL).

/** System-level behavioral rules */
export const SYSTEM_PROMPT = `You are an expert educational content creator specializing in adaptive learning curricula.

CRITICAL QUALITY REQUIREMENTS:
1. FACTUAL ACCURACY: All content must be 100% factually correct. Verify facts before including them.
2. CORRECTNESS: Every question must have ONE definitively correct answer. No ambiguity.
3. GRADE-APPROPRIATE: Language and concepts must match the specified grade level exactly.
4. CLARITY: Questions must be clear, unambiguous, and easy to understand.
5. PEDAGOGICAL SOUNDNESS: Follow best practices for teaching the subject.
6. SPECIFICITY: If the subject is vague (e.g., "mice"), interpret it in the most educationally valuable way for the grade level (e.g., "Mouse Biology and Anatomy" for elementary, "Rodent Behavior in Research" for high school).
7. DEPTH: Provide substantial, meaningful content. Avoid superficial questions. Each question should test real understanding.

Output only valid JSON with no markdown or additional text.`;

/** Schema contract template (output format rules) */
export const SCHEMA_TEMPLATE = `
Output Rules:
- Return ONLY valid JSON matching the Course v2 schema. No additional text.
- Do NOT wrap the JSON in Markdown or code fences (no triple backticks).
- No null/undefined values. Do not include extraneous keys.
- Each item.text MUST contain exactly ONE [blank] placeholder.
- Item IDs are contiguous starting at 0; groupId references an existing group.
- Levels cover ALL items; start/end are inclusive indices with no gaps.
`;

/** Pedagogical and structure guidelines */
export const PEDAGOGY_TEMPLATE = `
Course Structure:
1. Create 3-5 groups covering different aspects of the subject
2. Each group should have exactly {{itemsPerGroup}} items
3. Each item must have exactly 1 placeholder ([blank])
4. For options mode: 3-4 options with correctIndex
   - CRITICAL: The correct answer must be unquestionably correct
   - All distractors must be plausibly wrong but clearly incorrect
   - Avoid trick questions or ambiguous wording
5. For numeric mode: answer field (no options)
   - CRITICAL: The answer must be mathematically/factually correct
   - Round to appropriate precision for the grade level
6. Include clusterId and variant (1/2/3) for adaptive rotation
7. {{levelsInstruction}}
8. Create 2-4 study texts (reference materials) teaching the concepts
   - Study texts must teach the EXACT concepts tested in the items
   - Include clear definitions, examples, and explanations

Study Texts Format:
- Use [SECTION:Title] to mark major topics (e.g., "[SECTION:What are Fractions?]")
- Keep it concise for now: 1–2 sentences after each [SECTION]. We will expand later in a separate step.
- Insert [IMAGE:description] where visual aids would help (e.g., "[IMAGE:fraction-circle-diagram]")
- Keep language appropriate for grade level: {{grade}}
- Include real-world examples and analogies
- Link items to relevant study texts via relatedStudyTextIds
`;

/** Schema requirements (detailed field specs) */
export const SCHEMA_REQUIREMENTS = `
Schema Requirements (CRITICAL - FOLLOW EXACTLY):
- id (course): kebab-case string (e.g., "subject-name")
- title: string (descriptive course name, REQUIRED)
- contentVersion: string timestamp
- studyTexts: array of objects with:
  - id: string (kebab-case, e.g., "intro-fractions")
  - title: string (e.g., "Introduction to Fractions")
  - content: string with [SECTION:Title] markers and optional [IMAGE:description]
  - order: number (1, 2, 3...)
  - learningObjectives: optional array of strings
- groups: array of objects with:
  - id: number (e.g., 1, 2, 3)
  - name: string
  - color: optional string
- levels: array of objects with:
  - id: number (e.g., 1, 2, 3)
  - title: string
  - start: number (item index)
  - end: number (item index)
- items: array of objects with:
  - id: number (sequential: 0, 1, 2, 3...)
  - text: string with exactly one [blank] placeholder
  - groupId: number (references group.id)
  - clusterId: string (kebab-case)
  - variant: string "1" or "2" or "3" (NOT number)
  - mode: "options" or "numeric"
  - options: array of strings (only for options mode, 3-4 items)
  - correctIndex: number (only for options mode, 0-based index)
  - answer: number (only for numeric mode)
  - relatedStudyTextIds: optional array of strings (references studyTexts[].id)
`;

export interface CoursePromptConfig {
  subject: string;
  grade: string;
  itemsPerGroup: number;
  levelsCount?: number;
  mode: "options" | "numeric";
  sources?: Array<{ url: string; content: string; title?: string }>;
}

/** Mode-specific constraints */
export function getModeConstraints(mode: "options" | "numeric"): string {
  if (mode === "options") {
    return `
Mode Constraints (OPTIONS):
- Each item MUST include 3-4 options (array of strings)
- Each item MUST include correctIndex (0-based, pointing to the correct option)
- Do NOT include an "answer" field
`;
  }
  return `
Mode Constraints (NUMERIC):
- Each item MUST include "answer" (a number)
- Do NOT include "options" or "correctIndex" fields
`;
}

/** Build complete course generation prompt */
export function buildCoursePrompt(params: CoursePromptConfig): string {
  const { subject, grade, itemsPerGroup, levelsCount, mode, sources } = params;

  const levelsInstruction = levelsCount
    ? `Create exactly ${levelsCount} levels covering all items`
    : "Create 2-4 levels covering all items";

  const pedagogy = PEDAGOGY_TEMPLATE
    .replace("{{itemsPerGroup}}", String(itemsPerGroup))
    .replace("{{levelsInstruction}}", levelsInstruction)
    .replace("{{grade}}", grade);

  const modeConstraints = getModeConstraints(mode);

  let sourcesSection = "";
  if (sources && sources.length > 0) {
    sourcesSection = `\nResearch Sources:\n`;
    sources.forEach((s, i) => {
      sourcesSection += `\nSource ${i + 1} (${s.url}):\n${s.content.slice(0, 2000)}...\n`;
    });
    sourcesSection += `\nUse these sources to ensure accuracy and relevance.\n`;
  }

  const qualityGuidance = `\n\nQUALITY STANDARDS - READ CAREFULLY:
Your course will be reviewed for quality. Courses that score below 0.60 will be rejected.

If the subject is vague or broad, interpret it in the most pedagogically valuable way:
- "mice" for Grade 2 → "All About Pet Mice" (care, diet, body parts, habitat)
- "fractions" for Grade 3 → "Introduction to Fractions" (parts of a whole, comparing, simple addition)
- "photosynthesis" for Grade 7 → "How Plants Make Food" (chlorophyll, light energy, equations)

CRITICAL STRUCTURE REQUIREMENTS:
❗ MUST include all three arrays: groups, levels, AND items
❗ The items array is REQUIRED and must contain ${itemsPerGroup * 3} to ${itemsPerGroup * 5} items
❗ Each item must reference a valid groupId from the groups array
❗ Each level must have valid start/end indices that cover all items

QUESTION QUALITY REQUIREMENTS:
✓ GOOD: "A mouse has whiskers to help it [blank] in the dark." (options: sense its surroundings, see colors, hear better)
✗ BAD: "Mice are [blank]." (too vague - small? furry? mammals? all correct!)

✓ GOOD: "If you have 1/2 of a pizza and eat 1/4 more, you have [blank] of the pizza left." (tests real understanding)
✗ BAD: "A fraction has a [blank]." (too easy, not testing understanding)

Each question must:
1. Test a specific, meaningful concept
2. Have ONE unambiguously correct answer
3. Include plausible but clearly wrong distractors
4. Use clear, grade-appropriate language
5. Avoid trick questions or ambiguous wording\n`;

  return `Generate a complete educational course in JSON format following Course v2 schema.

Requirements:
- Subject: ${subject}
- Grade Level: ${grade}
- Items per group: ${itemsPerGroup}
- Levels requested: ${levelsCount ?? "auto (2–4)"}
- Mode: ${mode}${qualityGuidance}

${pedagogy}

${SCHEMA_REQUIREMENTS}

${modeConstraints}

${SCHEMA_TEMPLATE}${sourcesSection}`;
}

/** Repair prompt for batched item fixes */
export function buildRepairPrompt(params: {
  items: any[];
  courseContext: { subject: string; grade: string; mode: "options" | "numeric" };
  reason: string;
}): string {
  const { items, courseContext, reason } = params;

  return `Regenerate these educational course items with EXACTLY ONE placeholder [blank] per item. Keep the same ids, groupIds, clusterIds, and variants. The mode is ${courseContext.mode}.

Course context:
- Subject: ${courseContext.subject}
- Grade: ${courseContext.grade}
- Mode: ${courseContext.mode}

Reason for repair: ${reason}

Original items:
${JSON.stringify(items, null, 2)}

CRITICAL REQUIREMENTS:
1. item.text MUST contain exactly one [blank]
2. If mode = options: include 3-4 options and a valid correctIndex
3. If mode = numeric: include an "answer" number and DO NOT include options/correctIndex
4. Return ONLY valid JSON array of items matching the exact structure

${getModeConstraints(courseContext.mode)}

Output format: Return a JSON array of items (no extra commentary):
[
  { /* item 1 */ },
  { /* item 2 */ },
  ...
]`;
}

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
