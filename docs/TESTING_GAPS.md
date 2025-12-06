# Testing Gaps Analysis

## Issues That Could Have Been Caught with Automated Testing

### Summary
The authentication, CORS, and error handling issues we fixed **could have been caught** with proper test coverage. Here's what was missing:

---

## 1. Missing 401 Error Handling in `callEdgeFunctionGet`

**Issue:** `callEdgeFunctionGet` didn't have the same 401 error handling as `callEdgeFunction`.

**Could be caught by:**
- ✅ **Unit Test** - Mock 401 response, assert error message
- ✅ **Integration Test** - Call function without auth, verify error

**Missing Test:**
```typescript
it('throws user-friendly error for 401 in callEdgeFunctionGet', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: 'Unauthorized' }),
  });
  
  await expect(callEdgeFunctionGet('test')).rejects.toThrow(
    'Authentication required'
  );
});
```

---

## 2. Direct `supabase.functions.invoke` Calls Bypassing Helpers

**Issue:** 23 instances of direct `supabase.functions.invoke` calls bypass error handling.

**Could be caught by:**
- ✅ **ESLint Rule** - We have `no-direct-edge-calls` rule, but it needs to be stricter
- ✅ **Static Analysis** - AST-based linting (we have this!)
- ⚠️ **Current Status:** Rule exists but 23 instances remain (need to fix or exclude)

**Missing Enforcement:**
- Rule should flag ALL direct `supabase.functions.invoke` calls
- CI should fail if violations exist
- Need to audit and fix remaining instances

---

## 3. Missing User-Friendly Error Messages

**Issue:** Generic error messages instead of context-specific ones for preview environments.

**Could be caught by:**
- ✅ **Unit Test** - Assert error message content
- ✅ **E2E Test** - Verify user sees helpful message

**Missing Test:**
```typescript
it('provides Lovable preview-specific error message', async () => {
  window.location.hostname = 'id-preview--test.lovable.app';
  mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
  
  await expect(callEdgeFunction('test', {})).rejects.toThrow(
    'Authentication required. Please log in to use this feature in preview environments.'
  );
});
```

---

## 4. CORS Error Handling

**Issue:** CORS errors weren't handled gracefully, causing console noise.

**Could be caught by:**
- ✅ **Integration Test** - Test from different origin
- ✅ **E2E Test** - Verify CORS errors don't crash app
- ⚠️ **Current Status:** We have CORS header tests, but not error handling tests

**Missing Test:**
```typescript
it('handles CORS errors gracefully', async () => {
  const corsError = new TypeError('Failed to fetch');
  mockFetch.mockRejectedValueOnce(corsError);
  
  await expect(callEdgeFunction('test', {})).rejects.toThrow(
    'CORS error: Edge function test is not accessible'
  );
});
```

---

## 5. Lovable Preview Environment Detection

**Issue:** No detection of preview environments to skip problematic calls.

**Could be caught by:**
- ✅ **E2E Test** - Test in preview environment
- ✅ **Unit Test** - Mock `window.location.hostname`, verify behavior

**Missing Test:**
```typescript
it('skips mcp-metrics-proxy in Lovable preview', () => {
  window.location.hostname = 'id-preview--test.lovable.app';
  render(<FallbackBanner />);
  
  // Should show banner without making failed request
  expect(screen.getByText(/Observability proxy unavailable/)).toBeInTheDocument();
});
```

---

## Recommendations

### Immediate Actions

1. **Add Unit Tests for Error Handling**
   - Test 401, 403, CORS, network errors
   - Assert error message content
   - Test Lovable preview detection

2. **Strengthen ESLint Rules**
   - Make `no-direct-edge-calls` stricter
   - Add CI check to fail on violations
   - Fix remaining 23 instances

3. **Add Integration Tests**
   - Test API calls with mocked auth failures
   - Test CORS scenarios
   - Test error message propagation

4. **Add E2E Tests for Preview Environments**
   - Test in Lovable preview
   - Verify graceful degradation
   - Check error messages are user-friendly

### Test Coverage Goals

- **Unit Tests:** 90%+ coverage for `src/lib/api/common.ts`
- **Integration Tests:** All API error paths covered
- **E2E Tests:** Critical user flows in preview environments

---

## Current Test Coverage

✅ **What We Have:**
- CORS header tests (E2E)
- Contract validation tests
- Game state safety tests
- Validation schema tests

❌ **What's Missing:**
- API error handling tests
- Authentication failure tests
- CORS error handling tests
- Preview environment tests
- Error message content tests

---

## Conclusion

**Yes, these issues could have been caught** with:
1. Unit tests for error handling paths
2. Stricter ESLint rule enforcement
3. Integration tests for auth failures
4. E2E tests in preview environments

The gaps are primarily in **error handling test coverage** and **ESLint rule enforcement**.

