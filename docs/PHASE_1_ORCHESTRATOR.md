# Phase 1: Modular Orchestrator Architecture

## Overview

Phase 1 extracts the candidate-based generation pipeline from Phase 0 into separate, composable edge functions orchestrated by a coordinator. This enables:

- **Independent scaling** of each pipeline step
- **Easier testing** of individual components
- **Flexible composition** for different use cases
- **Better observability** per step

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        generate-course                          │
│                                                                 │
│  if USE_ORCHESTRATOR=1:                                         │
│    ┌──────────────────────────────────────────────────────┐    │
│    │           Delegate to ai-orchestrator                │    │
│    └──────────────────────────────────────────────────────┘    │
│  else if USE_CANDIDATES=1:                                      │
│    ┌──────────────────────────────────────────────────────┐    │
│    │        Inline candidate path (Phase 0)               │    │
│    └──────────────────────────────────────────────────────┘    │
│  else:                                                          │
│    ┌──────────────────────────────────────────────────────┐    │
│    │        Legacy single-gen + repair path               │    │
│    └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

                              ↓ (if USE_ORCHESTRATOR=1)

┌─────────────────────────────────────────────────────────────────┐
│                        ai-orchestrator                          │
│                                                                 │
│  Step 1: generate-candidates (K=3, parallel, diverse)          │
│          ↓                                                      │
│  Step 2: review-candidate (parallel, lightweight LLM critique) │
│          ↓                                                      │
│  Step 3: score-candidate (deterministic + consistency checks)  │
│          ↓                                                      │
│  Step 4: selectBestCandidate (argmax, fail-fast)               │
│          ↓                                                      │
│  Step 5: [optional] repair-candidate (single pass)             │
│          ↓                                                      │
│  Step 6: Store course to Storage                               │
│          ↓                                                      │
│  Step 7: Enqueue image generation jobs                         │
└─────────────────────────────────────────────────────────────────┘
```

## New Edge Functions

### 1. `generate-candidates`
**Endpoint**: `POST /functions/v1/generate-candidates`

Generates K candidate courses in parallel with diversity constraints.

**Input**:
```json
{
  "subject": "addition-basics",
  "grade": "Grade 2",
  "itemsPerGroup": 6,
  "mode": "numeric",
  "k": 3
}
```

**Output**:
```json
{
  "success": true,
  "candidates": [
    { "index": 0, "course": {...} },
    { "index": 1, "course": {...} },
    { "index": 2, "course": {...} }
  ],
  "metadata": {
    "requested": 3,
    "succeeded": 3,
    "totalTokens": 18450,
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

### 2. `review-candidate`
**Endpoint**: `POST /functions/v1/review-candidate`

Self-reviews a single candidate using lightweight LLM critique.

**Input**:
```json
{
  "candidate": {...},
  "subject": "addition-basics",
  "grade": "Grade 2",
  "mode": "numeric"
}
```

**Output**:
```json
{
  "success": true,
  "review": {
    "overall": 0.75,
    "clarity": 0.8,
    "age_fit": 0.85,
    "correctness": 0.7,
    "notes": "Questions clear but some answers could be more precise."
  }
}
```

### 3. `score-candidate`
**Endpoint**: `POST /functions/v1/score-candidate`

Scores a candidate deterministically (schema + consistency checks).

**Input**:
```json
{
  "candidate": {...},
  "mode": "numeric",
  "selfReview": {
    "overall": 0.75,
    "clarity": 0.8,
    "age_fit": 0.85,
    "correctness": 0.7,
    "notes": "..."
  }
}
```

**Output**:
```json
{
  "success": true,
  "score": 0.72,
  "issues": [
    "Item 3: math operation mismatch (expected 12.00, got 13)"
  ],
  "details": {
    "schema_valid": true,
    "placeholder_valid": true,
    "mode_constraints_valid": true,
    "consistency_score": 0.95,
    "self_review_score": 0.75
  }
}
```

### 4. `repair-candidate` (optional)
**Endpoint**: `POST /functions/v1/repair-candidate`

Single-pass repair of a candidate addressing specific issues.

**Input**:
```json
{
  "candidate": {...},
  "issues": [
    "Item 3: math operation mismatch",
    "Item 7: duplicate options"
  ],
  "subject": "addition-basics",
  "grade": "Grade 2",
  "mode": "numeric"
}
```

**Output**:
```json
{
  "success": true,
  "repaired": {...},
  "metadata": {
    "issuesAddressed": 2,
    "tokens": 1200,
    "latency_ms": 8500
  }
}
```

### 5. `ai-orchestrator`
**Endpoint**: `POST /functions/v1/ai-orchestrator`

Coordinates the full pipeline end-to-end.

**Input**:
```json
{
  "subject": "addition-basics",
  "grade": "Grade 2",
  "itemsPerGroup": 6,
  "mode": "numeric",
  "k": 3,
  "skipImages": false,
  "jobId": "uuid-optional"
}
```

**Output**:
```json
{
  "success": true,
  "course": {...},
  "imagesPending": 3,
  "metadata": {
    "selectedIndex": 1,
    "selectedScore": 0.72,
    "candidatesGenerated": 3,
    "latencyMs": 62000,
    "method": "orchestrated"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_ORCHESTRATOR` | `0` | Set to `1` to delegate to ai-orchestrator |
| `USE_CANDIDATES` | `0` | Set to `1` for inline candidate path (Phase 0) |
| `CANDIDATE_COUNT` | `3` | Number of candidates (K) |
| `MIN_VIABLE_SCORE` | `0.40` | Short-circuit threshold |

**Note**: `USE_ORCHESTRATOR` takes precedence over `USE_CANDIDATES`. If both are set to `1`, orchestrator path is used.

## Deployment

### Step 1: Deploy all new functions

```bash
cd supabase/functions

# Deploy modular components
supabase functions deploy generate-candidates
supabase functions deploy review-candidate
supabase functions deploy score-candidate
supabase functions deploy repair-candidate
supabase functions deploy ai-orchestrator

# Update main function
supabase functions deploy generate-course
```

### Step 2: Enable orchestrator mode

```bash
# Via Supabase CLI
supabase secrets set USE_ORCHESTRATOR=1
supabase secrets set CANDIDATE_COUNT=3
supabase secrets set MIN_VIABLE_SCORE=0.40

# Or via Dashboard
# Go to Edge Functions → generate-course → Settings
# Add: USE_ORCHESTRATOR=1
```

### Step 3: Verify deployment

```bash
# Test orchestrator directly
curl -X POST https://your-project.supabase.co/functions/v1/ai-orchestrator \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "addition-basics",
    "grade": "Grade 2",
    "itemsPerGroup": 6,
    "mode": "numeric",
    "k": 3
  }' | jq '.'

# Test via generate-course (should delegate to orchestrator)
curl -X POST https://your-project.supabase.co/functions/v1/generate-course \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "spanish-greetings",
    "grade": "Grade 3",
    "itemsPerGroup": 8,
    "mode": "options"
  }' | jq '.'
```

## Migration Strategies

### Strategy A: Gradual Rollout (Recommended)

1. **Week 1**: Deploy Phase 0 (`USE_CANDIDATES=1`, keep `USE_ORCHESTRATOR=0`)
   - Monitor latency and 422 rate
   - Tune `CANDIDATE_COUNT` and `MIN_VIABLE_SCORE`

2. **Week 2**: Deploy Phase 1 functions (but don't enable yet)
   - Deploy all 5 new edge functions
   - Keep `USE_ORCHESTRATOR=0`
   - Test orchestrator manually in dev

3. **Week 3**: Enable orchestrator for 10% traffic
   - Set `USE_ORCHESTRATOR=1` on 10% of requests (via load balancer or feature flag)
   - Monitor for regressions

4. **Week 4**: Full rollout
   - Set `USE_ORCHESTRATOR=1` globally
   - Monitor for 1 week
   - Proceed to Phase 2

### Strategy B: Direct Migration

1. Deploy all Phase 1 functions
2. Set `USE_ORCHESTRATOR=1`
3. Monitor closely for 24-48 hours
4. Rollback to `USE_CANDIDATES=1` if issues arise

### Strategy C: Side-by-Side Testing

Keep both paths active for comparison:

```bash
# Orchestrator path
USE_ORCHESTRATOR=1

# Inline candidate path (Phase 0)
USE_CANDIDATES=1

# Use routing logic to send different subjects to different paths
# Or use A/B testing via feature flags
```

## Testing

### Unit Tests

Test individual components:

```bash
# Test generate-candidates
deno test supabase/functions/generate-candidates/index.ts

# Test scoring logic
deno test supabase/functions/_shared/candidates.ts
```

### Integration Tests

```bash
# Run all orchestrator tests
USE_ORCHESTRATOR=1 npm run test:integration

# Compare orchestrator vs inline
npm run test:integration:compare
```

### Load Testing

```bash
# Generate 100 courses via orchestrator
artillery run tests/load/orchestrator.yml

# Monitor latency distribution
artillery report --output results.html
```

## Observability

### Logs to Monitor

**Per-function logs**:
- Supabase Dashboard → Project → Edge Functions → Logs
  - `ai-orchestrator`
  - `generate-candidates`
  - `review-candidate`
  - `score-candidate`

Note: The repo-pinned Supabase CLI may not include `supabase functions logs` in all versions.

**Key metrics**:
- Candidate generation: latency, success rate, tokens
- Review: success rate, latency per candidate
- Scoring: distribution of scores, common issues
- Selection: which candidate index wins (0, 1, 2)

### Dashboards

Query job summaries:

```sql
SELECT 
  summary->>'method' as method,
  AVG((summary->>'latency_ms')::int) as avg_latency_ms,
  AVG((summary->>'selected_score')::float) as avg_score,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE summary->>'method' = 'orchestrated') as orchestrated_count
FROM ai_course_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY summary->>'method';
```

## Performance Comparison

| Metric | Legacy Path | Phase 0 (Inline) | Phase 1 (Orchestrator) |
|--------|-------------|------------------|------------------------|
| P50 latency | ~80s | ~50s | ~55s |
| P95 latency | ~120s | ~75s | ~80s |
| 5xx rate | ~2% | <0.5% | <0.5% |
| 422 rate | ~8% | ~3% | ~3% |
| Testability | Low | Medium | High |
| Debuggability | Low | Medium | High |

**Why is orchestrator slightly slower than inline?**
- Additional HTTP round-trips between functions (~5-10s overhead)
- Trade-off for better modularity and testability

## Troubleshooting

### Orchestrator returns 500

Check logs for each step:
- Supabase Dashboard → Project → Edge Functions → Logs
  - Start with `ai-orchestrator` and search for "failed"
  - Then check the failing step function’s logs (e.g., `generate-candidates`)

### High latency

Profile each step:
1. Check `latency_ms` in job summary
2. Identify slow step (generation, review, scoring)
3. Optimize that function (reduce tokens, tune timeout, etc.)

### Inconsistent results

- Verify all functions deployed at same version
- Check `USE_CANDIDATES` and `USE_ORCHESTRATOR` flags are consistent
- Ensure `CANDIDATE_COUNT` and `MIN_VIABLE_SCORE` match across configs

## Next Steps

After Phase 1 stabilizes:

1. **Decommission legacy code** (Phase 2, TODO #18)
   - Remove `batchRepairItems`
   - Remove per-item regeneration
   - Keep simplified normalization only

2. **Add optional repair step** to orchestrator
   - If `selected.score < 0.60` but `> 0.40`, call `repair-candidate`
   - Re-score and use if improved

3. **Introduce caching**
   - Cache candidates for same subject/grade/mode
   - Reduce repeated generation costs

4. **Add circuit breakers**
   - Fail-fast if generate-candidates has high error rate
   - Automatic rollback to legacy path

## Rollback Procedure

If issues arise:

```bash
# Disable orchestrator
supabase secrets set USE_ORCHESTRATOR=0

# Or fall back to legacy entirely
supabase secrets set USE_CANDIDATES=0
supabase secrets set USE_ORCHESTRATOR=0

# Redeploy with previous version
git checkout <previous-commit>
supabase functions deploy generate-course
```
