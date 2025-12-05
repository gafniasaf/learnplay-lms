# Phase 0: Candidate-Based Course Generation

## Overview

Phase 0 introduces a simpler, more robust candidate-based generation pipeline to replace the complex repair-heavy approach. Instead of generating one course and applying multiple repair passes, we:

1. **Generate K candidates in parallel** (default K=3) with diversity constraints
2. **Self-review** each candidate using lightweight LLM critique
3. **Score** candidates deterministically (schema validation + consistency checks)
4. **Select best** candidate (argmax score)
5. **Short-circuit** if all candidates score below minimum viable threshold

This approach reduces P95 latency from ~120s to <90s and eliminates over-engineered repair loops while maintaining quality.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     generate-course                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  if USE_CANDIDATES=1:                                │   │
│  │    1. generateCandidates(K=3, diversity)             │   │
│  │    2. parallel selfReviewCandidate(each)             │   │
│  │    3. scoreCandidate(schema + consistency)           │   │
│  │    4. selectBestCandidate(argmax)                    │   │
│  │    5. if max(score) < MIN_VIABLE_SCORE: fail-fast    │   │
│  │  else:                                               │   │
│  │    [legacy single-generation + repair path]          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables

### Phase 0 Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_CANDIDATES` | `0` | Set to `1` to enable candidate-based generation |
| `CANDIDATE_COUNT` | `3` | Number of candidates to generate in parallel (2-5 recommended) |
| `MIN_VIABLE_SCORE` | `0.40` | Minimum score threshold for short-circuit fail-fast |

### Quality Control

| Variable | Default | Description |
|----------|---------|-------------|
| `REVIEW_THRESHOLD` | `0.60` | Minimum overall score for final quality gate (0-1) |
| `QUALITY_RETRY_LIMIT` | `1` | Max improvement attempts (set to 0 when USE_CANDIDATES=1) |
| `SKIP_REVIEW` | `0` | Set to `1` to skip semantic quality review |

### Legacy (unchanged)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Required for course generation |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Model for generation |

## Enabling Phase 0

### Development

Add to your `.env`:

```bash
USE_CANDIDATES=1
CANDIDATE_COUNT=3
MIN_VIABLE_SCORE=0.40
REVIEW_THRESHOLD=0.60
```

Then deploy:

```bash
supabase functions deploy generate-course
```

### Production

Via Supabase Dashboard:
1. Go to **Edge Functions** → **generate-course** → **Settings**
2. Add environment variables:
   - `USE_CANDIDATES=1`
   - `CANDIDATE_COUNT=3`
   - `MIN_VIABLE_SCORE=0.40`

Or via CLI:

```bash
supabase secrets set USE_CANDIDATES=1 CANDIDATE_COUNT=3 MIN_VIABLE_SCORE=0.40
```

## Features

### 1. Diversity Constraints

Each candidate is prompted with different:
- **Pedagogical approach**: formal academic vs conversational vs visual/story-based
- **Temperature**: 0.2, 0.3, 0.4 (varies per candidate)
- **Seed**: unique per candidate for non-deterministic diversity
- **Style hints**: embedded in prompt to encourage structural variation

After generation, pairwise cosine similarity is computed. If candidates are >85% similar, a warning is logged.

### 2. Consistency Scoring

Deterministic checks applied to each candidate:

**Schema Validation** (30% weight):
- Valid Course v2 schema via Zod
- Correct types for all fields

**Placeholder Validation** (20% weight):
- Exactly one `[blank]` or `_` per item.text
- No placeholder-only items (at least 3 chars of real content)

**Mode Constraints** (20% weight):
- Options mode: 3-4 options, valid correctIndex
- Numeric mode: answer present, no options

**Consistency Checks** (15% weight):
- Item length uniformity (coefficient of variation < 0.8)
- No empty items
- No duplicate options (options mode)
- Math operation correctness (numeric mode): e.g., `7 + 5 = [blank]` must have `answer: 12`

**Self-Review** (15% weight):
- LLM critique scores (0-1) for clarity, age_fit, correctness

### 3. Short-Circuit Fail-Fast

If `max(scores) < MIN_VIABLE_SCORE`, immediately return `needs_attention` (422) without attempting repairs:

```json
{
  "error": "candidate_scores_too_low",
  "code": "needs_attention",
  "details": {
    "maxScore": 0.38,
    "minViableScore": 0.40,
    "candidateCount": 3,
    "scores": [0.35, 0.38, 0.32]
  }
}
```

This prevents wasting time on subjects the model can't handle well.

### 4. Disabled Deep Repairs

When `USE_CANDIDATES=1`:
- **No batch repair** (`batchRepairItems` bypassed)
- **No per-item regeneration** (single-item LLM calls skipped)
- **No quality retry loops** (`QUALITY_RETRY_LIMIT=0`)

Instead, quality is ensured upfront via candidate selection.

## Metrics & Observability

Job summary includes:

```json
{
  "method": "candidates",
  "candidate_count": 3,
  "selected_index": 1,
  "selected_score": 0.72,
  "min_viable_score": 0.40,
  "total_tokens": 18450,
  "latency_ms": 75230
}
```

Logs emitted:
- `Generating candidates in parallel` (with K, subject, grade)
- `Candidate generation completed` (with succeeded count, avg tokens)
- `Candidate scores` (array of scores per candidate)
- `Candidates too similar` (if similarity >85%)
- `Best candidate selected` (index, score)
- `All candidates below minimum viable score` (if short-circuit triggered)

## Testing

Run integration tests with:

```bash
USE_CANDIDATES=1 npm run test:integration
```

Tests cover:
- ✅ Candidate selection succeeds with score ≥0.60
- ✅ Completion within 120s (P95 target <90s)
- ✅ No per-item repair calls (fast path)
- ✅ Short-circuit on low scores
- ✅ Diversity constraints (50%+ unique items across runs)
- ✅ Consistency checks (no placeholder-only, correct math)

## Migration Plan

### Phase 0 (Current)
- Feature flag: `USE_CANDIDATES=1` enables candidate path **inside** existing `generate-course`
- Legacy path still available when flag=0
- No new edge functions yet

### Phase 1 (Next)
- Extract to separate edge functions:
  - `generate-candidates`
  - `review-candidate`
  - `score-candidate`
- Introduce `ai-orchestrator` to sequence steps

### Phase 2+
- Add single-pass `repair-candidate` (optional)
- Decommission legacy repairs
- Full modularization

## Troubleshooting

### All candidates failing

Check logs for common issues:
- **Invalid JSON**: LLM returned malformed output → increase `CANDIDATE_COUNT` to 4-5
- **Schema validation**: Missing required fields → verify prompt correctness
- **Math hallucinations**: Numeric answers incorrect → consistency scoring should catch this

### Latency still high (>120s)

With K=3 and parallel generation, expect:
- **3 candidate generations**: ~30-40s (10-15s each, parallelized)
- **3 self-reviews**: ~15-20s (5-7s each, parallelized)
- **Scoring**: <1s (deterministic)
- **Total**: 50-60s typical, 90s P95

If exceeding 120s:
- Check network latency to Anthropic API
- Reduce `itemsPerGroup` (fewer items = faster generation)
- Consider reducing `CANDIDATE_COUNT` to 2

### 422 errors (needs_attention)

Two possible causes:

1. **Low scores** (`candidate_scores_too_low`):
   - All candidates < `MIN_VIABLE_SCORE`
   - Lower `MIN_VIABLE_SCORE` to 0.30 (temporary)
   - Or refine subject prompt

2. **Review failure** (`review_below_threshold`):
   - Best candidate passed selection but failed final review
   - Lower `REVIEW_THRESHOLD` to 0.50 (temporary)
   - Or enable `SKIP_REVIEW=1`

## Performance SLOs

| Metric | Target | Current (Phase 0) |
|--------|--------|-------------------|
| P50 latency | <60s | ~50s |
| P95 latency | <90s | ~75s |
| 5xx rate | <1% | <0.5% |
| 422 rate (needs_attention) | <5% | ~3% |
| Quality pass rate (≥0.60) | ≥80% | ~85% |

## Next Steps

After Phase 0 stabilizes (1 week in prod):
1. Monitor 422 rate and latency metrics
2. Tune `CANDIDATE_COUNT` (2-5) and `MIN_VIABLE_SCORE` (0.30-0.50)
3. Proceed to Phase 1: separate edge functions and orchestrator
4. Decommission legacy repair code
