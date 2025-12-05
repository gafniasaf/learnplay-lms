# Phase 1 Integration Tests - Implementation Summary

## Overview
Comprehensive integration tests for the 5 new Phase 1 edge functions that implement the modular candidate-based course generation pipeline.

## Created Files

### 1. `phase1-edge-functions.test.ts` (815 lines)
Main test suite covering all 5 edge functions plus end-to-end integration.

**Test Coverage:**
- ✅ `generate-candidates`: 6 tests
- ✅ `review-candidate`: 3 tests
- ✅ `score-candidate`: 4 tests
- ✅ `repair-candidate`: 4 tests
- ✅ `ai-orchestrator`: 7 tests
- ✅ End-to-end integration: 1 test

**Total: 25 integration tests**

### 2. `run-phase1-tests.sh`
Bash script for running tests on Linux/macOS with environment validation.

### 3. `run-phase1-tests.ps1`
PowerShell script for running tests on Windows with environment validation.

### 4. `README.md`
Comprehensive documentation covering:
- Test suite descriptions
- Prerequisites and setup
- Running tests locally and in CI/CD
- Performance benchmarks
- Debugging guides
- Troubleshooting tips
- Writing new tests

## Test Statistics

| Edge Function | Tests | Coverage Areas |
|--------------|-------|----------------|
| `generate-candidates` | 6 | Generation, timeouts, validation, K parameter ranges |
| `review-candidate` | 3 | Review scores, timeouts, validation |
| `score-candidate` | 4 | Deterministic scoring, self-review, placeholder detection, performance |
| `repair-candidate` | 4 | Single-pass repair, timeout, empty issues, validation |
| `ai-orchestrator` | 7 | Full pipeline, P95 target, short-circuit, diversity, placeholders, validation |
| **Integration** | 1 | E2E pipeline flow |
| **TOTAL** | **25** | **Full pipeline coverage** |

## Key Test Features

### 1. Performance Validation
- ✅ `generate-candidates`: <110s timeout
- ✅ `review-candidate`: <30s timeout
- ✅ `score-candidate`: <2s (deterministic)
- ✅ `repair-candidate`: <60s timeout
- ✅ `ai-orchestrator`: <90s (P95 target)

### 2. Input Validation
All functions test:
- ✅ Valid input handling
- ✅ Invalid input rejection (400 status)
- ✅ Missing required fields detection
- ✅ Out-of-range parameter validation

### 3. Output Validation
All functions verify:
- ✅ Response structure (success, data fields)
- ✅ Metadata presence (tokens, latency, counts)
- ✅ Data type correctness
- ✅ Value ranges (scores 0-1, etc.)

### 4. Quality Checks
- ✅ Placeholder validation (exactly one `[blank]` per item)
- ✅ Mode constraints (options vs numeric)
- ✅ Schema compliance
- ✅ Diversity metrics (40%+ different content)
- ✅ Consistency checks (no placeholder-only items)

### 5. Error Handling
- ✅ Short-circuit behavior on low scores
- ✅ Graceful degradation
- ✅ Proper error codes and messages
- ✅ Timeout handling

## Usage

### Quick Start

**Linux/macOS:**
```bash
chmod +x tests/integration/run-phase1-tests.sh
./tests/integration/run-phase1-tests.sh
```

**Windows:**
```powershell
.\tests\integration\run-phase1-tests.ps1
```

**Direct Deno:**
```bash
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts
```

### Environment Setup
```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

### Run Specific Tests
```bash
# Run only generate-candidates tests
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts --filter "generate-candidates"

# Run only orchestrator tests
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts --filter "ai-orchestrator"

# Run specific test
deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts --filter "should complete within P95"
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      
      - name: Run Phase 1 Integration Tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          deno test --allow-net --allow-env tests/integration/phase1-edge-functions.test.ts
```

## Test Fixtures

### Valid Course Fixture
A minimal valid course structure used across tests:
- 2 numeric items (addition problems)
- 1 group
- 1 level
- Proper placeholder formatting
- Valid mode constraints

### Invalid Test Cases
- Multiple placeholders
- Missing placeholders
- Invalid mode (numeric with options)
- Out-of-range parameters
- Malformed JSON

## Expected Behavior

### Success Cases
- All functions return `{ success: true, ... }`
- Status code 200
- Proper data structure in response
- Metadata includes relevant metrics

### Failure Cases
- Invalid input: 400 with `invalid_request` code
- Missing API key: 500 with `configuration_error` code
- Generation failure: 500 with specific error code
- Low scores: 422 with `scores_too_low` code

## Performance Benchmarks

Based on Phase 1 architecture targets:

| Metric | Target | Measured |
|--------|--------|----------|
| P50 Latency | <60s | Tested via orchestrator |
| P95 Latency | <90s | ✅ Explicit test case |
| Candidate Generation | <110s | ✅ Explicit test case |
| Review per Candidate | <30s | ✅ Explicit test case |
| Scoring (deterministic) | <2s | ✅ Explicit test case |
| Repair (single pass) | <60s | ✅ Explicit test case |

## Maintenance

### Adding New Tests
1. Add test to appropriate `describe` block
2. Follow existing patterns (setup → call → assert)
3. Include both success and failure cases
4. Verify performance targets
5. Update this summary and README

### Updating Fixtures
When schema changes:
1. Update `VALID_COURSE_FIXTURE` in test file
2. Update invalid fixtures as needed
3. Verify all tests still pass
4. Update documentation

### Monitoring
- Run tests on each deployment
- Track P95 latency trends
- Monitor failure rates by test
- Update timeout values if needed

## Known Limitations

1. **API Key Required**: Tests skip if `ANTHROPIC_API_KEY` not set
2. **Network Dependent**: Requires Supabase instance running
3. **Non-Deterministic**: Some tests may have slight timing variations
4. **Rate Limits**: May hit API rate limits with parallel execution
5. **Cost**: Tests consume API tokens (minimal per run)

## Future Enhancements

- [ ] Add load testing (concurrent requests)
- [ ] Add stress testing (large itemsPerGroup)
- [ ] Add chaos testing (network failures, timeouts)
- [ ] Add regression testing (compare outputs over time)
- [ ] Add cost tracking (tokens per test run)
- [ ] Add visual regression testing (generated images)
- [ ] Mock API responses for faster CI runs

## Troubleshooting

See `README.md` for detailed troubleshooting guide.

**Common Issues:**
1. Tests skipped → Set `ANTHROPIC_API_KEY`
2. Connection refused → Run `supabase start`
3. 401 errors → Verify service role key
4. Timeouts → Check network/API latency

## Success Criteria

All 25 tests passing indicates:
✅ All 5 edge functions operational
✅ Pipeline integration working
✅ Performance targets met (<90s P95)
✅ Input validation working
✅ Error handling correct
✅ Quality checks passing

## Related Documentation

- `README.md` - Full test documentation
- `candidate-path.test.ts` - Phase 0 tests
- `docs/PHASE_1_ORCHESTRATOR.md` - Architecture docs
- `docs/DEPLOYMENT_GUIDE.md` - Deployment guide
