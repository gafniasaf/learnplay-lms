# Changelog

All notable changes to the LearnPlay Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (Phase 0-3)
- Comprehensive environment configuration documentation (`docs/ENVIRONMENT_CONFIG.md`)
- Dependency audit process and documentation (`docs/DEPENDENCY_AUDIT.md`)
- Secrets rotation playbook with quarterly schedule (`docs/SECRETS_ROTATION.md`)
- Content Security Policy (CSP) headers on edge functions and SPA shell
- Sentry error tracking with requestId propagation across client and edge
- Row Level Security (RLS) policies on `ai_course_jobs` and `ai_media_jobs`
- Per-user rate limiting (10 jobs/hour) enforced at database level
- Idempotency keys on job tables to prevent duplicate submissions
- Structured logging utility (`src/lib/logger.ts`) with Sentry integration
- Job queue resilience: exponential backoff retries, heartbeats, dead-letter queue
- Worker heartbeat system to detect stale jobs (>5 min without update)
- Job metrics tracking: processing duration, generation duration, retry counts
- Admin Jobs Dashboard (`/admin/jobs`) with requeue and monitoring features
- AI provider abstraction layer with fallback support (OpenAI → Anthropic)
- PII redaction utility for safe logging of user prompts
- AI provider telemetry tracking (latency, error rates, cost estimates)
- AI Providers documentation (`docs/AI_PROVIDERS.md`)
- Job Queue Operations runbook (`docs/JOB_QUEUE_OPERATIONS.md`)

### Changed
- Enhanced `README.md` with current architecture, features, and environment modes
- Updated `ApiError` class to include `requestId` for distributed tracing
- Modified `callEdgeFunctionGet` to extract `x-request-id` from response headers
- Enhanced `ai-job-runner` with retry backoff, heartbeats, and metrics capture
- Updated `ai-author-live.spec.ts` E2E test to validate full job lifecycle

### Security
- Added CSP to prevent XSS attacks
- Added `X-Content-Type-Options: nosniff` to prevent MIME sniffing
- Added `X-Frame-Options: DENY` to prevent clickjacking
- Added `Referrer-Policy: strict-origin-when-cross-origin`
- Implemented database-enforced rate limiting on job submissions
- Added idempotency protection against duplicate job runs

### Database Migrations
- `20251023000000_phase1_security_enhancements.sql` - RLS, rate limiting, idempotency, ai_media_jobs table
- `20251023000001_phase2_job_resilience.sql` - Retry counts, heartbeats, dead-letter, metrics view

## [0.1.0] - 2025-10-23

### Added (Pre-Phase)
- Multimedia stimulus support (image, audio, video) in Play UI
- Parent Dashboard with KPIs, time-range filtering (Day/Week/Month), subject tracking
- Student Dashboard with weekly goals, Continue card, Next Up, achievements
- AI Course generation with OpenAI and Anthropic fallback
- Job queue system for async AI processing
- Storage-based course catalog with HTTP caching and ETag support
- Adaptive learning algorithm with clusterId, variant, and levels
- Multi-role support (student, teacher, parent, school admin, platform admin)
- Seeded shuffle for stable answer option ordering

### Fixed
- Parent Dashboard Day/Week/Month toggle now reactive to URL query params
- Student/Parent routing: `/kids` and `/parents` redirect to new dashboards
- Option Grid shuffle stability: deterministic seeding prevents dynamic re-ordering
- TypeScript errors in Dashboard and Parents pages

## Version Numbering

- **Major (X.0.0):** Breaking changes, major features, schema changes requiring migration
- **Minor (0.X.0):** New features, backwards-compatible enhancements
- **Patch (0.0.X):** Bug fixes, documentation, minor improvements

## Upgrade Guide

### From 0.0.0 to 0.1.0

**Database:**
```bash
# Apply migrations (if not already applied)
npx supabase db push
```

**Environment Variables (Optional):**
```env
# New in 0.1.0
VITE_USE_STORAGE_READS=true  # Enable direct storage reads (recommended for preview)
AI_PROVIDER_PRIORITY=openai,anthropic  # Set provider fallback order
```

**Breaking Changes:**
- None (additive only)

### Future: 0.1.0 to 0.2.0 (Planned)

**Multimedia Interfaces:**
- Visual MCQ, Audio MCQ, Video Prompt (additive)
- AI-generated media via `ai_media_jobs` queue
- Additional exercise types: Drag-and-drop, Diagram labeling, Matching, etc.

**Breaking Changes:**
- Course schema may add `schemaVersion` field (migration provided)

## Release Process

1. **Update CHANGELOG.md** with all changes since last release
2. **Bump version** in `package.json`
3. **Run full test suite:**
   ```bash
   npm test
   npm run typecheck
   npm run e2e
   ```
4. **Create git tag:**
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0 - Job queue resilience and security"
   git push origin v0.1.0
   ```
5. **Deploy to production:**
   - Lovable Cloud: Auto-deploys on push to `main`
   - Database: `npx supabase db push` for migrations
6. **Monitor for 24 hours:**
   - Check Sentry for error spikes
   - Review job queue metrics
   - Validate user flows

## Support

For questions or issues:
- [GitHub Issues](https://github.com/gafniasaf/dawn-react-starter/issues)
- [Documentation](./docs/)
- Email: support@yourcompany.com

