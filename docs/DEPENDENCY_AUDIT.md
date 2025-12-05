# Dependency Audit and Lock

**Last Updated:** 2025-10-23  
**Audit Date:** 2025-10-23

## Audit Summary

```bash
npm audit
```

### Current Vulnerabilities

**Moderate Severity (2):**
1. **esbuild <=0.24.2** (GHSA-67mh-4wv8-2f99)
   - Issue: Development server allows any website to send requests and read responses
   - Impact: Development-only vulnerability
   - Affected: `vite` (depends on `esbuild`)
   - Fix available: `npm audit fix --force` (breaking change - Vite 5.x → 7.x)
   - Risk Assessment: **Low** (dev-only, not exposed in production)

2. **playwright <1.55.1** (GHSA-7mvr-c777-76hp)
   - Issue: Downloads browsers without SSL certificate verification
   - Impact: Test infrastructure only
   - Affected: `@playwright/test`
   - Fix available: `npm audit fix --force`
   - Risk Assessment: **Low** (test-only dependency)

### Actions Taken

1. Ran `npm audit fix` (non-breaking fixes applied)
2. Documented remaining vulnerabilities
3. Assessed risk levels
4. Deferred breaking changes for dedicated testing phase

### Recommendations

**Short-term (Current Release):**
- ✅ Accept remaining moderate vulnerabilities (dev/test only)
- ✅ Lock current dependency versions in `package-lock.json`
- ✅ Monitor for security advisories

**Medium-term (Next Sprint):**
- [ ] Test Vite 7.x upgrade in isolated branch
- [ ] Validate build output and dev server behavior
- [ ] Update Playwright to latest stable (>=1.55.1)
- [ ] Re-run full E2E test suite
- [ ] Deploy to preview for validation

**Long-term (Ongoing):**
- [ ] Schedule monthly `npm audit` reviews
- [ ] Set up Dependabot or Renovate for automated PR dependency updates
- [ ] Establish testing protocol for major version bumps
- [ ] Document upgrade paths in `CHANGELOG.md`

## Dependency Lock Status

✅ `package-lock.json` is committed and up-to-date  
✅ All production dependencies have exact versions locked  
✅ CI uses `npm ci` for reproducible builds  

## Package Version Pins

### Critical Production Dependencies

| Package | Version | Rationale |
|---------|---------|-----------|
| `react` | `^18.3.1` | Stable, well-tested |
| `@supabase/supabase-js` | `^2.75.1` | Latest stable Supabase client |
| `@sentry/react` | `^10.20.0` | Latest Sentry SDK |
| `zod` | `^3.25.76` | Schema validation in use |

### Critical Dev Dependencies

| Package | Version | Rationale |
|---------|---------|-----------|
| `vite` | `^5.4.19` | Stable, awaiting 7.x testing |
| `@playwright/test` | `^1.49.0` | Current, awaiting 1.55.1+ upgrade |
| `jest` | `^29.7.0` | Latest stable |
| `typescript` | `^5.8.3` | Latest stable |

## CI/CD Dependency Management

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-jest.yml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'npm'
- run: npm ci  # Uses package-lock.json for reproducibility
```

### Build Process

```bash
# Local development
npm install  # Uses package-lock.json

# CI/CD
npm ci  # Clean install from lock file

# Audit
npm audit  # Check for vulnerabilities
npm audit fix  # Auto-fix non-breaking issues
```

## Security Policy

### Vulnerability Response

1. **Critical/High severity in production deps:**
   - Immediate patch within 24 hours
   - Emergency release if actively exploited
   - Notify stakeholders via Sentry

2. **Moderate severity in production deps:**
   - Assess impact within 48 hours
   - Patch in next sprint cycle
   - Document in release notes

3. **Low severity or dev/test deps:**
   - Review in monthly audit
   - Batch updates in maintenance releases

### Update Cadence

- **Security patches:** As needed (immediate)
- **Minor versions:** Monthly review
- **Major versions:** Quarterly assessment with dedicated testing

## Tools and Automation

### Current Setup

- ✅ `npm audit` in CI (informational, non-blocking)
- ✅ Lock file committed to git
- ✅ `npm ci` in all CI workflows

### Planned Improvements

- [ ] Dependabot configured for security updates
- [ ] Automated PR creation for dependency updates
- [ ] Snyk or similar for enhanced vulnerability scanning
- [ ] Weekly dependency health reports

## Historical Audit Log

| Date | Vulnerabilities | Actions | Notes |
|------|-----------------|---------|-------|
| 2025-10-23 | 4 moderate | `npm audit fix` applied | Reduced to 2 moderate (dev-only) |

## References

- [npm audit documentation](https://docs.npmjs.com/cli/v9/commands/npm-audit)
- [Supabase Client Changelog](https://github.com/supabase/supabase-js/releases)
- [Vite Changelog](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md)
- [Playwright Releases](https://github.com/microsoft/playwright/releases)

