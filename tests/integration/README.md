# Integration Tests

Integration tests for the Dawn React Starter course generation system.

## Test Suites

### Phase 0: Candidate Path Tests (`candidate-path.test.ts`)
Tests for the inline candidate-based generation approach (Phase 0).

**Coverage:**
- Candidate selection with score ≥0.60
- Completion within 120s timeout
- No per-item repair calls when using candidate path
- Short-circuit on low scores
- Diversity constraints (50%+ unique items)
- Consistency checks (no placeholder-only items)
- Math operation correctness

**Run:**
```bash
deno test --allow-net --allow-env tests/integration/candidate-path.test.ts
```

### Phase 1: Edge Function Tests (`phase1-edge-functions.test.ts`)
Tests for the modular edge functions introduced in Phase 1.

**Coverage:**

#### `generate-candidates` edge function
- Generates K=3 candidates for numeric mode
- Generates K=2 candidates for options mode
- Completes within 110s timeout
- Rejects invalid input (missing fields, out-of-range k)
- Returns proper metadata (requested, succeeded, tokens)

#### `review-candidate` edge function
- Reviews valid candidates
- Returns scores (overall, clarity, age_fit, correctness) in range [0,1]
- Completes within 30s timeout
- Rejects invalid input

#### `score-candidate` edge function
- Scores candidates without self-review (deterministic only)
- Scores candidates with self-review data
- Detects invalid placeholders and reports issues
- Completes instantly (<2s, deterministic)
- Returns score in range [0,1], issues array, details object

#### `repair-candidate` edge function
- Repairs candidates with issues (e.g., multiple placeholders)
- Completes within 60s timeout
- Handles empty issues list gracefully
- Returns repaired course with metadata (tokens, latency)
- Rejects invalid input

#### `ai-orchestrator` edge function
- Orchestrates full pipeline: generate → review → score → select
- Returns valid course with metadata
- Completes within 90s (P95 target)
- Handles short-circuit when all scores too low
- Generates diverse candidates (40%+ different structures)
- Validates all items have exactly one placeholder
- Rejects invalid input

#### End-to-end integration
- Full pipeline: generate → review → score
- Verifies data flows correctly between functions

**Run:**
```bash
# Using the runner script
./tests/integration/run-phase1-tests.sh

# Or directly with Deno
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts
```

## Prerequisites

### Required Environment Variables

```bash
export SUPABASE_URL="http://127.0.0.1:54321"  # or your Supabase project URL
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

**Note:** Tests will be skipped if `ANTHROPIC_API_KEY` is not set.

### Local Development

For local testing, start Supabase:

```bash
supabase start
```

Then run the tests:

```bash
# Phase 0 tests
deno test --allow-net --allow-env tests/integration/candidate-path.test.ts

# Phase 1 tests
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts

# All integration tests
deno test --allow-net --allow-env tests/integration/
```

## Test Structure

Each test suite follows this pattern:

1. **Setup**: Define fixtures and environment variables
2. **Test Groups**: Organized by edge function or feature
3. **Assertions**: Verify response structure, data validity, performance
4. **Error Handling**: Test invalid inputs and error codes

## Performance Benchmarks

| Edge Function | Target | Measurement |
|--------------|--------|-------------|
| `generate-candidates` | <110s | P95 latency for K=3 |
| `review-candidate` | <30s | Per-candidate review time |
| `score-candidate` | <2s | Deterministic scoring |
| `repair-candidate` | <60s | Single-pass repair |
| `ai-orchestrator` | <90s | Full pipeline (P95 target) |

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run Integration Tests
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    deno test --allow-net --allow-env tests/integration/
```

## Debugging

Enable verbose logging:

```bash
# Show detailed test output
deno test --allow-net --allow-env tests/integration/ --trace-ops

# Run specific test
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts --filter "should generate K=3"
```

## Coverage

Run with coverage reporting:

```bash
deno test --allow-net --allow-env --coverage=cov_profile tests/integration/
deno coverage cov_profile
```

## Writing New Tests

Follow this pattern:

```typescript
describe("your-edge-function", { ignore: !hasApiKey }, () => {
  
  it("should handle valid input", async () => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/your-function`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // your input
      })
    });
    
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    // more assertions...
  });
  
  it("should reject invalid input", async () => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/your-function`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.code).toBe("invalid_request");
  });
});
```

## Troubleshooting

### Tests are skipped
**Cause:** `ANTHROPIC_API_KEY` not set
**Solution:** Export your Anthropic API key

### Connection refused
**Cause:** Supabase not running locally or incorrect URL
**Solution:** Run `supabase start` or check `SUPABASE_URL`

### Timeouts
**Cause:** Network latency or API rate limits
**Solution:** Increase timeout values or reduce test parallelism

### 401 Unauthorized
**Cause:** Invalid service role key
**Solution:** Verify `SUPABASE_SERVICE_ROLE_KEY` is correct

## Maintenance

- Update test fixtures when schema changes
- Adjust timeout values based on production performance
- Add new tests for each new edge function
- Review and update performance benchmarks quarterly
