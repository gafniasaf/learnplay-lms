# Phase 1 Tests - Quick Start

## 🚀 Run All Tests (25 tests)

```bash
# Windows
.\tests\integration\run-phase1-tests.ps1

# Linux/macOS
./tests/integration/run-phase1-tests.sh

# Direct
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts
```

## 🔑 Required Environment Variables

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

## 📦 Edge Functions Tested

| Function | Tests | Focus |
|----------|-------|-------|
| `generate-candidates` | 6 | K=2/3 generation, timeouts, validation |
| `review-candidate` | 3 | Scoring (0-1), timeouts, validation |
| `score-candidate` | 4 | Deterministic, self-review, issues |
| `repair-candidate` | 4 | Single-pass repair, issues, validation |
| `ai-orchestrator` | 7 | Full pipeline, P95<90s, short-circuit |
| **E2E Integration** | 1 | Generate → Review → Score |

## ⚡ Run Specific Tests

```bash
# Just one function
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts \
  --filter "generate-candidates"

# Just orchestrator
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts \
  --filter "ai-orchestrator"

# Specific test case
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts \
  --filter "should complete within P95"
```

## ✅ Expected Results

All 25 tests should pass with:
- ✅ Valid responses (200 status)
- ✅ Proper error codes (400, 422, 500)
- ✅ Performance targets met
- ✅ Quality checks passing

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests skipped | Set `ANTHROPIC_API_KEY` |
| Connection refused | Run `supabase start` |
| 401 Unauthorized | Check `SUPABASE_SERVICE_ROLE_KEY` |
| Timeouts | Check network/API latency |

## 📊 Performance Targets

- `generate-candidates`: < 110s
- `review-candidate`: < 30s
- `score-candidate`: < 2s
- `repair-candidate`: < 60s
- `ai-orchestrator`: < 90s (P95)

## 📝 Test Coverage

**Total:** 25 integration tests
- Input validation: 5 tests
- Performance benchmarks: 5 tests
- Quality checks: 6 tests
- Error handling: 4 tests
- E2E integration: 1 test
- Feature tests: 4 tests

## 🔗 More Info

- Full docs: `tests/integration/README.md`
- Summary: `tests/integration/PHASE1_TEST_SUMMARY.md`
- Phase 0 tests: `tests/integration/candidate-path.test.ts`
