# ADR 003: AI Course Generation & Review

**Status:** Accepted  
**Date:** 2025-01-20  
**Deciders:** Product & Engineering

## Context

Creating quality educational content is time-consuming and requires pedagogical expertise. We need a way to rapidly prototype courses while maintaining quality standards.

## Decision

We implement **AI-powered course generation** with a **two-stage validation pipeline**:
1. **Generator:** Creates course structure + items from user prompts
2. **Reviewer:** Validates quality, accuracy, and pedagogical soundness

### Architecture

```
┌──────────────┐
│ Admin Prompt │ (e.g., "Create a course on Spanish verbs")
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│  generate-course   │ ← LLM (Gemini 2.5 Pro)
│  Edge Function     │   Structured output (Zod schema)
└─────────┬──────────┘
          │ Generated course.json
          ▼
┌────────────────────┐
│  review-course     │ ← LLM (Gemini 2.5 Pro)
│  Edge Function     │   Quality checks + feedback
└─────────┬──────────┘
          │
          ├─► ✅ Approved → Upload to storage
          │
          └─► ❌ Rejected → Return feedback to admin
```

## Generator Implementation

### Prompt Engineering

```typescript
const GENERATION_SYSTEM_PROMPT = `
You are an expert educational content creator specializing in 
adaptive learning curricula. Generate courses that:

1. STRUCTURE: Follow the exact JSON schema (validated by Zod)
2. PEDAGOGY: Progress from easy → hard (Bloom's taxonomy)
3. VARIETY: Mix question types (multiple choice, numeric, fill-in)
4. ACCURACY: All content factually correct and grade-appropriate
5. ENGAGEMENT: Use clear language, avoid ambiguity

Output ONLY valid JSON. No markdown, no explanations.
`;
```

### Schema Validation

```typescript
import { CourseSchema } from "../_shared/validation.ts";

const parsed = CourseSchema.safeParse(generatedJson);
if (!parsed.success) {
  return Errors.invalidRequest(
    `Generated course failed validation: ${formatValidationError(parsed.error)}`
  );
}
```

### Key Generation Parameters

- **Model:** `google/gemini-2.5-pro` (best reasoning for complex tasks)
- **Temperature:** `0.7` (creative but not too random)
- **Max Tokens:** `8000` (supports ~40-50 items per course)
- **Timeout:** `60s` (LLM can be slow for large courses)

## Reviewer Implementation

### Quality Checks

```typescript
const REVIEW_CRITERIA = {
  structure: [
    "All required fields present",
    "Item IDs unique and sequential",
    "Groups properly reference items",
    "Levels properly reference groups"
  ],
  content: [
    "Questions grammatically correct",
    "Answers factually accurate",
    "Difficulty progression logical",
    "No offensive/inappropriate content"
  ],
  pedagogy: [
    "Clear learning objectives",
    "Age-appropriate language",
    "Mix of question types",
    "Balanced difficulty distribution"
  ]
};
```

### Reviewer Prompt

```typescript
const REVIEW_SYSTEM_PROMPT = `
You are a senior curriculum reviewer. Evaluate the course on:

1. ACCURACY: All facts correct? Any misconceptions?
2. CLARITY: Questions unambiguous? Instructions clear?
3. DIFFICULTY: Appropriate progression? No sudden spikes?
4. ENGAGEMENT: Interesting examples? Varied question types?

Return JSON with:
- approved: boolean
- score: 0-100
- issues: [{ severity, category, description }]
- suggestions: string[]
`;
```

### Approval Threshold

- **Auto-approve:** Score ≥ 85 with no critical issues
- **Manual review:** Score 70-84 or any major issues flagged
- **Auto-reject:** Score < 70 or critical issues detected

## Consequences

### Positive

✅ **Speed:** Generate full course (40 items) in ~30 seconds  
✅ **Quality:** Two-stage validation catches errors  
✅ **Iteration:** Failed courses return actionable feedback  
✅ **Scalability:** Create hundreds of courses without human labor  
✅ **Customization:** Adapt to specific curricula/standards

### Negative

❌ **Cost:** LLM API calls expensive at scale ($0.10-0.50 per course)  
❌ **Variability:** AI may generate inconsistent quality  
❌ **Expertise:** Still needs human review for specialized subjects  
❌ **Hallucinations:** AI may generate plausible but incorrect facts

## Risk Mitigation

### Preventing Hallucinations

1. **Grounding:** Prompt includes factual constraints
2. **Schema validation:** Forces structured output
3. **Dual review:** Generator + reviewer must both succeed
4. **Human oversight:** Admins review before publishing

### Rate Limiting

```typescript
// Prevent abuse/spam
const rl = rateLimit(req, {
  maxRequests: 10,
  windowMs: 3600000 // 10 generations per hour
});
```

### Cost Control

- **Caching:** Cache generated courses by prompt hash
- **Batching:** Generate multiple courses in one request
- **Fallbacks:** Use cheaper model (Gemini Flash) for simple courses

## Implementation Details

### Edge Function: generate-course

**Endpoint:** `POST /generate-course`

**Request:**
```json
{
  "prompt": "Create a Spanish verb conjugation course for beginners",
  "itemCount": 40,
  "difficulty": "easy"
}
```

**Response (Success):**
```json
{
  "course": { /* CourseV2 JSON */ },
  "metadata": {
    "generationTime": 28.4,
    "model": "google/gemini-2.5-pro",
    "tokenCount": 7420
  }
}
```

**Response (Failure):**
```json
{
  "error": {
    "code": "generation_failed",
    "message": "AI failed to generate valid course structure"
  }
}
```

### Edge Function: review-course

**Endpoint:** `POST /review-course`

**Request:**
```json
{
  "course": { /* CourseV2 JSON */ }
}
```

**Response:**
```json
{
  "approved": true,
  "score": 92,
  "issues": [
    {
      "severity": "minor",
      "category": "content",
      "description": "Question 12: Consider simplifying vocabulary"
    }
  ],
  "suggestions": [
    "Add more visual examples",
    "Consider adding hints for harder questions"
  ]
}
```

## Alternatives Considered

### Human-Only Content Creation
- ❌ Too slow (days per course)
- ❌ Requires specialized expertise
- ✅ Highest quality

### Template-Based Generation
- ✅ Fast and cheap
- ❌ Limited variety
- ❌ No adaptation to user needs

### Fine-Tuned Model
- ✅ Better quality than generic LLM
- ❌ Requires training dataset (we don't have enough)
- ❌ Expensive to train and maintain

## Monitoring

Key metrics:
- **Generation success rate** (target: >90%)
- **Review approval rate** (target: 70-85%)
- **Average generation time** (target: <45s)
- **Cost per course** (target: <$0.30)
- **Human override rate** (% of AI-approved courses rejected by admins)

## Future Enhancements

1. **Multi-modal:** Generate images/diagrams for visual questions
2. **Adaptive difficulty:** Adjust based on student performance data
3. **Localization:** Auto-translate to other languages
4. **Curriculum alignment:** Tag items to educational standards (e.g., Common Core)
5. **Feedback loop:** Fine-tune model on high-quality human-curated courses

## References

- [Lovable AI Documentation](https://docs.lovable.dev/features/ai)
- [Course Schema](../../src/lib/schemas/courseV2.ts)
- [Generator Tests](../../src/lib/tests/agent.generate.contract.test.ts)
- [Reviewer Tests](../../src/lib/tests/agent.review.contract.test.ts)
