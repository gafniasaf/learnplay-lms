# KW1C Teacher Search Quality System

This document describes the search quality evaluation and improvement system for the KW1C teacher cockpit.

## Overview

The KW1C cockpit allows teachers to search ExpertCollege MES curated materials. To ensure search results meet teacher expectations, we implemented:

1. **Improved search algorithm** in `search-curated-materials` Edge function
2. **LLM-based evaluation pipeline** to programmatically verify search quality

---

## 1. Search Algorithm Improvements

**File:** `supabase/functions/search-curated-materials/index.ts`

### Text Normalization

All text (queries and content) is normalized for accent-insensitive, case-insensitive matching:

```typescript
function normalizeText(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .normalize("NFD")                      // Decompose accents
    .replace(/[\u0300-\u036f]/g, "")       // Remove accent marks
    .replace(/[^a-z0-9\s]/g, " ")          // Remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}
```

This allows `hygiene` to match `hygiëne`, `communicatie` to match `communicatie`, etc.

### Stopword Removal

Dutch stopwords are filtered out to focus on meaningful terms:

```typescript
const STOPWORDS = new Set([
  "en", "de", "het", "een", "van", "voor", "met", "in", "op", "te", 
  "aan", "bij", "onder", "over", "tot", "naar", "uit", "is", "zijn", 
  "wordt", "worden", "die", "dat", "dit", "deze", "maar", "ook", "of", 
  "als", "dan", "er",
]);
```

### Term Expansion

Dutch compound words are expanded to catch partial matches:

```typescript
function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const t of terms) {
    // "wondzorg" → also search for "wond"
    if (t.length >= 7 && t.endsWith("zorg")) {
      const root = t.slice(0, -4);
      if (root.length >= 4) expanded.add(root);
    }
    // "huidverzorging" → also search for "huid"
    if (t.length >= 11 && t.endsWith("verzorging")) {
      const root = t.slice(0, -"verzorging".length);
      if (root.length >= 4) expanded.add(root);
    }
  }
  return Array.from(expanded).slice(0, 12);
}
```

### Scoring System

Results are scored using multiple factors:

| Factor | Points | Description |
|--------|--------|-------------|
| Exact phrase in title | +30 | Full query appears in title |
| Exact phrase in course_name | +28 | Full query appears in course name |
| Exact phrase in category | +18 | Full query appears in category |
| Exact phrase in preview | +12 | Full query appears in preview text |
| Individual term matches | +6-36 | Per term, weighted by term length |
| Term coverage bonus | +8 | All query terms found |
| Partial coverage penalty | -2 | Only 1 of multiple terms found |

Term weights increase with length (longer = more specific):
- 8+ chars: weight 3
- 5-7 chars: weight 2
- 3-4 chars: weight 1

### Candidate Pool

When a query is provided, we fetch up to **5000 candidates** (vs 200 for browsing) to ensure comprehensive scoring before returning top results.

---

## 2. LLM Evaluation Pipeline

**File:** `scripts/kw1c-llm-search-eval.ts`

### Architecture

The pipeline uses **two LLM calls per test case**:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Test Case     │────▶│  LLM #1: Build  │────▶│  Expectations   │
│ (query/filters) │     │  Expectations   │     │  (JSON)         │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│  Search API     │────▶│  Actual Results │──────────────┤
│  (Edge Func)    │     │  (top 5)        │              │
└─────────────────┘     └─────────────────┘              │
                                                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  LLM #2: Verify │◀────│  Expectations   │
                        │  Results        │     │  + Results      │
                        └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Verdict        │
                        │  pass/fail/score│
                        └─────────────────┘
```

### Step 1: Build Expectations

The first LLM acts as an "experienced MBO healthcare teacher" and generates expected signals:

```typescript
const expectationPrompt = `
You are an experienced MBO healthcare teacher in the Netherlands...
For this search, describe what results you would expect:
- must_have_signals: terms/concepts that MUST appear
- nice_to_have_signals: terms that would be good to see
- avoid_signals: terms that indicate wrong results
- expected_material_types: e.g. ["theorie", "oefening"]
- min_relevant_in_top5: minimum relevant results expected
`;
```

Output example:
```json
{
  "must_have_signals": ["hygiëne", "handhygiëne", "infectiepreventie"],
  "nice_to_have_signals": ["VMS", "desinfectie", "protocollen"],
  "avoid_signals": ["anatomie", "fysiologie", "3D model"],
  "expected_material_types": ["theorie"],
  "min_relevant_in_top5": 3
}
```

### Step 2: Verify Results

The second LLM acts as an "independent reviewer" with strict criteria:

```typescript
const verifyPrompt = `
You are an independent reviewer evaluating search results...
Be strict: pass only if results exceed expectations.

Return JSON:
{
  "pass": boolean,
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "summary": "...",
  "issues": ["..."],
  "suggestions": ["..."]
}
`;
```

### Test Matrix

13 test cases covering common teacher searches:

| ID | Query | Filters | Intent |
|----|-------|---------|--------|
| zorgplicht | "zorgplicht" | - | Duty of care exercises |
| privacy | "privacy" | type=oefening | Privacy/AVG exercises |
| wet-zorg-en-dwang | "wet zorg en dwang" | type=oefening | Wzd law exercises |
| zorgverzekeringswet | "zorgverzekeringswet" | - | Zvw exercises |
| anatomie-fysiologie | "anatomie fysiologie" | type=theorie | A&F theory |
| klinisch-redeneren | "klinisch redeneren" | type=theorie | Clinical reasoning |
| hygiene | "hygiene" | type=theorie | Hygiene theory |
| communicatie-client | "communicatie client" | type=oefening | Communication exercises |
| veiligheid-incident | "veiligheid incident" | type=oefening | Safety/VIM exercises |
| wondzorg | "wondzorg" | type=theorie | Wound care theory |
| wetgeving | "wetgeving" | type=oefening | Healthcare law exercises |
| medicatie | "medicatie" | type=theorie | Medication theory |
| wetgeving-category-filter | "wetgeving" | category=Wetgeving en beleid | Category-filtered law |

### Running the Evaluation

```bash
npx tsx scripts/kw1c-llm-search-eval.ts
```

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `learnplay.env`.

---

## 3. Current Results

**Pass Rate: 7/13 (54%)**

**Last evaluation:** 2026-01-15

### Passing
- wet-zorg-en-dwang, zorgverzekeringswet
- anatomie-fysiologie, klinisch-redeneren, hygiene
- wetgeving, wetgeving-category-filter

### Failing (Corpus Gaps)

| Query | Issue |
|-------|-------|
| zorgplicht | Results are tangential to duty of care and miss explicit zorgplicht framing or scenarios |
| privacy | Mostly generic AVG knowledge checks, not healthcare-specific privacy dilemmas |
| communicatie-client | Theory-heavy questions; lacks practical communication/role-play exercises |
| veiligheid-incident | No practical incident reporting or analysis assignments |
| wondzorg | Specialized triage/surgery content, no foundational wound care theory |
| medicatie | Overly concentrated on VMS high-risk meds; missing foundational pharmacology topics |

These failures are **corpus content gaps**, not search ranking issues. The search returns the most relevant content available, but the corpus lacks practical, foundational materials for these intents.

---

## 4. Recommendations

### To Reach 80% Pass Rate

1. **Index/ingest additional MES coverage:**
   - Zorgplicht and professional conduct modules with explicit duty-of-care framing
   - Practical privacy cases in healthcare settings (patient data, dossiers, consent)
   - Communication skills with role-play or scenario formats
   - Foundational wound care theory modules (healing phases, assessment)
   - Foundational pharmacology (drug classes, dosing, routes, side effects)

2. **Use metadata-driven filtering in the cockpit:**
   - Encourage teachers to filter by topic tags and scenario presence
   - Prioritize scenario-present exercises when the query implies practice

3. **Improve preview richness (optional):**
   - Longer excerpts for scenario-based exercises so teachers can judge fit quickly

---

## 5. File References

| File | Purpose |
|------|---------|
| `supabase/functions/search-curated-materials/index.ts` | Search Edge function |
| `scripts/kw1c-llm-search-eval.ts` | LLM evaluation pipeline |
| `scripts/index-mes-expertcollege.ts` | MES content indexer |
| `src/pages/teacher/Kw1cCockpit.tsx` | Teacher UI component |
| `tmp/kw1c-teacher-test-matrix.md` | Test case definitions |

---

## 6. Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     KW1C Teacher Cockpit                       │
│                    (Kw1cCockpit.tsx)                          │
└───────────────────────────┬────────────────────────────────────┘
                            │ POST /search-curated-materials
                            ▼
┌────────────────────────────────────────────────────────────────┐
│              search-curated-materials Edge Function            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Normalize    │─▶│ Extract &    │─▶│ Score & Rank         │ │
│  │ Query        │  │ Expand Terms │  │ (phrase + term match)│ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└───────────────────────────┬────────────────────────────────────┘
                            │ Query entity_records
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ entity_records (entity='curated-material')               │ │
│  │ - id, title, data (JSON with course_name, category, etc) │ │
│  │ - Indexed from MES via index-mes-expertcollege.ts        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

*Last updated: January 2026*
