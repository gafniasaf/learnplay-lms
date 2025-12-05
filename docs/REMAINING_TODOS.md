# Remaining TODO Items

**Last Updated:** 2025-10-23  
**Status:** Production-ready core complete; optional enhancements listed below

## Overview

Phases 0-3, 6-7 (partial), 8-11 are **COMPLETE** with all critical infrastructure in place. The items below are **optional enhancements** that can be implemented incrementally based on business priorities.

---

## Phase 4 - AI Multimedia Generation (8 items)

**Status:** Database schema complete; implementation deferred to future sprint  
**Priority:** Medium (enables AI-generated images/audio/video for exercises)

### Implementation Tasks

1. **ai-media-runner edge function**
   - Similar to `ai-job-runner` but for media jobs
   - Integrates with OpenAI Images, ElevenLabs TTS, Replicate
   - Retry logic, heartbeats, metrics (reuse patterns from Phase 2)
   - **Estimated effort:** 2-3 days

2. **Image generation integration (OpenAI DALL-E)**
   - API: `https://api.openai.com/v1/images/generations`
   - Timeout: 60s
   - Storage: Upload to `courses/<courseId>/assets/images/<hash>.png`
   - **Estimated effort:** 1 day

3. **TTS generation (OpenAI TTS or ElevenLabs)**
   - API: `https://api.openai.com/v1/audio/speech`
   - Store audio + transcript
   - **Estimated effort:** 1 day

4. **Video generation (Replicate or similar)**
   - Async job (videos take 2-5 minutes)
   - Webhook callback on completion
   - **Estimated effort:** 2 days

5. **StimulusEditor enhancements**
   - "Generate with AI" button in AIAuthor stimulus panel
   - Submit job to `ai_media_jobs` table
   - Poll for completion and update item stimulus
   - **Estimated effort:** 1 day

6. **Unit tests for media runners**
   - Test provider API mocking
   - Test storage writes
   - Test retry logic
   - **Estimated effort:** 1 day

7. **E2E test for media job flow**
   - Submit media job → wait for completion → verify in Play UI
   - **Estimated effort:** 0.5 day

**Total Phase 4 Effort:** ~8-10 days

---

## Phase 5 - Advanced Learning Interfaces (40 items)

**Status:** Not started (separate feature epic)  
**Priority:** Low-Medium (extends beyond core MCQ/numeric modes)

These are entirely new exercise types documented in `docs/MULTIMEDIA_ROADMAP.md`:

### Exercise Types to Implement

1. **Visual MCQ** (MCQ with image options) - 4 tasks (component test, impl, unit test, E2E)
2. **Audio MCQ** (MCQ with audio prompts) - 4 tasks
3. **Video Prompt** (MCQ after video) - 4 tasks
4. **Diagram Labeling** (click-to-label interactive) - 4 tasks
5. **Drag-and-Drop Classification** (sort items into buckets) - 4 tasks
6. **Matching Pairs** (connect related items) - 4 tasks
7. **Ordering/Sequencing** (arrange steps) - 4 tasks
8. **Manipulative Numeric** (number line, fraction bars) - 4 tasks
9. **Data/Graph Interpretation** (read charts, answer questions) - 4 tasks
10. **Timed Fluency Sprints** (rapid-fire questions with timer) - 4 tasks

**Per exercise type:** Component test → Implementation → Unit test → E2E test (TDD cycle)

**Total Phase 5 Effort:** ~30-40 days (can be parallelized across team or done incrementally)

**Recommendation:** Implement 1 exercise type per sprint based on curriculum needs.

---

## Phase 6 - Parent Dashboard Polish (4 items)

**Status:** Core functionality complete; polish deferred  
**Priority:** Low (nice-to-have UX improvements)

1. **Skeleton loaders** during data fetch
   - Add `<Skeleton />` components while loading
   - **Estimated effort:** 2 hours

2. **Improved ARIA labels**
   - Add detailed `aria-label` to charts and sparklines
   - **Estimated effort:** 2 hours

3. **Visual polish**
   - Refine KPI card animations
   - Enhance sparkline rendering
   - **Estimated effort:** 4 hours

4. **Documentation update**
   - Add screenshots to `docs/PARENT_DASHBOARD.md`
   - **Estimated effort:** 1 hour

**Total Phase 6 Effort:** ~1 day

---

## Phase 7 - Student Dashboard Polish (3 items)

**Status:** Core functionality complete; polish deferred  
**Priority:** Low

1. **WeeklyGoalRing ARIA enhancements**
   - Add narration: "X of Y minutes complete"
   - **Estimated effort:** 2 hours

2. **Virtualize sessions list**
   - If user has >100 sessions, use `react-window`
   - **Estimated effort:** 3 hours

3. **Documentation update**
   - Add usage flows to `docs/STUDENT_DASHBOARD.md`
   - **Estimated effort:** 1 hour

**Total Phase 7 Effort:** 0.5-1 day

---

## Phase 8 - Additional Performance (3 items)

**Status:** Core splitting complete; incremental optimizations deferred  
**Priority:** Low (current bundle size acceptable: 262 KB gzipped main chunk)

1. **Virtualize long item lists in author UIs**
   - AIAuthor item list (if >100 items)
   - CourseAuthor item list
   - Use `react-window` or `@tanstack/react-virtual`
   - **Estimated effort:** 4 hours

2. **React.memo optimization**
   - Memoize `OptionGrid`, `Stem`, chart components
   - Measure impact with React DevTools Profiler
   - **Estimated effort:** 3 hours

3. **Responsive image srcset**
   - Generate thumbnails via Supabase image transformations
   - Add `srcset` for responsive loading
   - **Estimated effort:** 1 day

**Total Phase 8 Effort:** ~2 days

---

## Phase 9 - CI/CD Enhancements (2 items)

**Status:** Core CI complete; advanced monitoring deferred  
**Priority:** Low-Medium

1. **Bundle size budget guard**
   - Add `bundlesize` package
   - Fail CI if main bundle >300 KB gzipped
   - **Estimated effort:** 2 hours

2. **Playwright screenshot regression**
   - Add `toHaveScreenshot()` for critical UI
   - Run on CI, fail on visual changes
   - **Estimated effort:** 4 hours

**Total Phase 9 Effort:** ~1 day

---

## Phase 10 - API & Schema (3 items)

**Status:** Versioning strategy documented; implementation optional  
**Priority:** Low (no breaking changes planned)

1. **cURL examples in API_REFERENCE.md**
   - Add request/response examples for all 37 edge functions
   - **Estimated effort:** 1 day

2. **Course schemaVersion field**
   - Add `schemaVersion: 2` to course JSON
   - Create migration utility for v1→v2
   - **Estimated effort:** 1 day

3. **OpenAPI/TypeScript client generation**
   - Generate typed client from edge function signatures
   - Use `openapi-typescript` or similar
   - **Estimated effort:** 2 days

**Total Phase 10 Effort:** ~4 days

---

## Recommended Prioritization

### High Priority (Next Sprint)
- **Phase 4: AI Media Generation** (8-10 days)
  - Enables fully AI-generated courses with images, audio, video
  - High user value, aligns with platform vision

### Medium Priority (Within 2 Months)
- **Phase 9: Bundle size guard** (2 hours)
- **Phase 10: cURL examples** (1 day)
- **Phase 5: 1-2 learning interfaces** (4-8 days)
  - Start with Visual MCQ and Drag-and-Drop (highest curriculum demand)

### Low Priority (As Needed)
- **Phase 6/7: Dashboard polish** (1-2 days total)
- **Phase 8: Performance micro-optimizations** (2 days)
- **Phase 10: Schema versioning** (1 day, only if breaking changes planned)

---

## Deferred Items (Not Recommended)

These items were cancelled because:
- **Already implemented** via previous Lovable sessions
- **Diminishing returns** (current performance acceptable)
- **Premature optimization** (wait for actual usage data)

If metrics show a need (e.g., bundle size >500 KB, page load >5s, user complaints), revisit:
- React.memo for every component
- Virtualization everywhere
- Screenshot regression for all pages

---

## How to Resume Work

### For AI Media Generation (Phase 4):

1. **Create edge function:**
   ```bash
   npx supabase functions new ai-media-runner
   ```

2. **Implement provider integrations:**
   - Copy retry/heartbeat pattern from `ai-job-runner`
   - Add provider-specific API calls (OpenAI Images, ElevenLabs, etc.)

3. **Update StimulusEditor:**
   - Add "Generate with AI" button
   - Submit to `ai_media_jobs` table
   - Poll and update UI

4. **Follow TDD:** Component test → Impl → Unit test → E2E

### For New Learning Interfaces (Phase 5):

1. **Pick one interface** (e.g., Visual MCQ)

2. **Follow MULTIMEDIA_ROADMAP.md** step-by-step

3. **TDD sequence:**
   - Write component test first
   - Implement component
   - Add unit tests
   - Write E2E spec

4. **Iterate:** Complete one interface before starting next

---

## References

- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [docs/MULTIMEDIA_ROADMAP.md](./MULTIMEDIA_ROADMAP.md) - Learning interface rollout plan
- [docs/JOB_QUEUE_OPERATIONS.md](./JOB_QUEUE_OPERATIONS.md) - Job queue operations
- [docs/GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) - Production launch procedures

---

## Questions or Issues?

- Review code audit: `reports/code-audit-2025-10-23.md`
- Check runbooks: `docs/JOB_QUEUE_OPERATIONS.md`
- Rollback procedures: `docs/DEPLOYMENT_ROLLBACK.md`

