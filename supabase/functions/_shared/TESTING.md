# Unit Testing for Shared Functions

## Overview
This directory contains Jest unit tests for shared utility functions used across Supabase edge functions.

## Test Files

### `candidates.test.ts`
Comprehensive unit tests for the candidate-based generation system (Phase 0/1).

**Coverage Target**: >90% (functions, lines, statements)

**Test Suites**: 2 main suites, 10 sub-suites, **72 test cases**

#### `scoreCandidate` Function (54 tests)
- **Schema validation** (3 tests)
  - Valid course scoring
  - Invalid schema detection
  - Missing required fields
  
- **Placeholder validation** (3 tests)
  - Single placeholder per item
  - Multiple placeholder detection
  - Missing placeholder detection
  
- **Mode constraints validation** (8 tests)
  - Numeric mode requirements
  - Numeric with options (invalid)
  - Numeric without answer (invalid)
  - Options mode requirements
  - Invalid option counts (too few/many)
  - Missing/negative correctIndex
  
- **Consistency checks** (9 tests)
  - Item length uniformity
  - Empty text detection
  - Placeholder-only detection
  - Math operation validation (add, subtract, multiply, divide)
  - Duplicate options detection
  
- **Self-review integration** (3 tests)
  - Score incorporation
  - Null review handling
  - Low review impact
  
- **Score bounds** (2 tests)
  - Cap at 1.0
  - Floor at 0.0
  
- **Edge cases** (3 tests)
  - Empty items array
  - Missing items property
  - Missing text property

#### `selectBestCandidate` Function (18 tests)
- **Best candidate selection** (2 tests)
  - Highest score selection
  - Tie-breaking (first wins)
  
- **Minimum viable score threshold** (4 tests)
  - Below threshold (returns null)
  - At threshold (exact match)
  - High threshold rejection
  - Low threshold acceptance
  
- **Edge cases** (4 tests)
  - Empty arrays
  - Single candidate above/below threshold
  - Mismatched array lengths
  
- **Score ordering** (3 tests)
  - Highest at start/middle/end

## Running Tests

### Run all unit tests
```bash
npm test
```

### Run with coverage report
```bash
npm run test:coverage
```

### Run specific test file
```bash
npm test -- candidates.test
```

### Run in watch mode
```bash
npm run test:watch
```

### Run specific test suite
```bash
npm test -- --testNamePattern="scoreCandidate"
```

### Run specific test case
```bash
npm test -- --testNamePattern="detects math operation mismatch"
```

## Coverage Report

After running `npm run test:coverage`, view the report:

```bash
# Open HTML report (Windows)
start reports/coverage/lcov-report/index.html

# View text summary
cat reports/coverage/lcov.info
```

## Expected Coverage

For `candidates.ts`:
- **Functions**: >90%
- **Lines**: >90%
- **Statements**: >90%
- **Branches**: >70%

The test suite achieves this by:
- Testing all exported functions (`scoreCandidate`, `selectBestCandidate`)
- Covering all validation paths (schema, placeholders, mode constraints, consistency)
- Testing all edge cases (empty arrays, missing fields, boundary conditions)
- Testing all math operations (add, subtract, multiply, divide)
- Testing both numeric and options modes
- Testing self-review integration
- Testing score bounds and thresholds

## Test Structure

Each test follows this pattern:

```typescript
describe('function: testGroup', () => {
  const ctx = { requestId: 'test-123', functionName: 'test' };
  
  describe('Feature group', () => {
    it('should validate specific behavior', () => {
      const input = { /* test data */ };
      const result = functionUnderTest(input, ctx);
      
      expect(result.property).toBe(expectedValue);
      expect(result.issues.length).toBe(0);
    });
  });
});
```

## Mocked Dependencies

The test suite mocks:
- `./log.ts` - Logging functions (logInfo, logWarn, logError)
- `./ai.ts` - AI generation functions (generateJson, getProvider, getModel)
- `./prompts.ts` - Prompt building (buildCoursePrompt)

This allows pure unit testing of `scoreCandidate` and `selectBestCandidate` without external dependencies.

## Adding New Tests

When adding new functionality to `candidates.ts`:

1. **Add test cases** to `candidates.test.ts`
2. **Follow existing patterns** (describe blocks, meaningful names)
3. **Test both success and failure paths**
4. **Include edge cases**
5. **Run coverage** to ensure >90%:
   ```bash
   npm run test:coverage -- candidates.test
   ```
6. **Update this documentation**

## Continuous Integration

Add to your CI pipeline:

```yaml
- name: Run Unit Tests with Coverage
  run: npm run test:coverage
  
- name: Check Coverage Thresholds
  run: |
    if ! npm test -- --coverage --coverageThreshold='{"global":{"functions":90,"lines":90,"statements":88}}'; then
      echo "Coverage below threshold!"
      exit 1
    fi
```

## Troubleshooting

### Tests fail with "Cannot find module"
**Solution**: Run `npm install` to install dependencies

### Coverage below threshold
**Solution**: Add more test cases for uncovered branches/lines

### Mock issues
**Solution**: Verify mock paths match actual imports in `candidates.ts`

### TypeScript errors
**Solution**: Ensure `@types/jest` is installed and tsconfig includes test files

## Related Files

- `candidates.ts` - Implementation
- `generation-utils.test.ts` - Tests for generation utilities
- `prompts.test.ts` - Tests for prompt building
- `../../tests/integration/phase1-edge-functions.test.ts` - Integration tests (Deno)

## Maintenance

- Update tests when schema changes
- Add tests for new validation rules
- Review coverage after refactoring
- Keep test data fixtures up to date
