# AI Pipeline Testing Guide

## Job Selection Semantics

The AI Pipeline UI supports deterministic job selection for testing and user convenience:

### Selection Priority
1. **URL parameter** `?jobId=<uuid>` - highest priority, used for E2E tests
2. **localStorage** `selectedJobId` - persisted across reloads
3. **Auto-select** - most recent job if none selected

### How It Works
```typescript
// PipelineLayout reads ?jobId on mount
const params = new URLSearchParams(window.location.search);
const jobId = params.get('jobId');

// Falls back to localStorage if no URL param
const stored = localStorage.getItem('selectedJobId');

// Persists selection for next visit
localStorage.setItem('selectedJobId', selectedJobId);
```

### Testing Usage
```typescript
// E2E test: create job and navigate with ID
const job = await createTestJob();
await page.goto(`/admin/ai-pipeline?jobId=${job.id}`);
```

## RLS Policies

### ai_course_jobs
- **SELECT**: Users can view their own jobs (`created_by = auth.uid()`) or admin-visible jobs
- **INSERT**: Admins can create jobs (with `created_by` set)
- **DELETE**: Admins can delete jobs

### job_events  
- **SELECT**: Users can view events for jobs they can see (cascades from ai_course_jobs policy)
- **INSERT**: Service role can insert (for edge functions)

## Test Helpers

### test-create-job
Creates an `ai_course_jobs` row with service role and associates it with the current user for RLS visibility.

**Availability**: Only when `TEST_MODE=true` or `DEV_MODE=true`

```typescript
const response = await fetch('/functions/v1/test-create-job', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    subject: 'E2E Test Course',
    grade: '3-5',
    items_per_group: 12,
    mode: 'options'
  })
});
const { job } = await response.json();
// job.id available for selection
```

### test-emit-job-event
Emits a `job_events` row for a specific job to drive phase transitions in tests.

**Availability**: Only when `TEST_MODE=true` or `DEV_MODE=true`

```typescript
await fetch('/functions/v1/test-emit-job-event', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    jobId: job.id,
    step: 'generating',
    progress: 25
  })
});
```

## Disabling Triggers in Tests

The `trigger_ai_job_runner` function respects `app.test_mode`:

```sql
-- In test setup (via Supabase settings or migration)
ALTER DATABASE postgres SET app.test_mode = 'true';

-- Or per-session
SET app.test_mode = 'true';
```

When `app.test_mode = 'true'` or `'1'`, the trigger will skip HTTP calls to `ai-job-runner`, allowing deterministic E2E control via test helpers.

## Phase Step Constants

All phase steps are defined in `src/lib/pipeline/phaseSteps.ts`:

```typescript
import { PHASE_STEPS, STEP_TO_PHASE_INDEX } from '@/lib/pipeline/phaseSteps';

// Use constants instead of strings
emitJobEvent(jobId, PHASE_STEPS.GENERATING, 25);

// Map step to phase index
const index = STEP_TO_PHASE_INDEX['generating']; // 0
```

### Steps
- `queued`, `pending` → phase -1
- `generating` → phase 0
- `validating` → phase 1
- `repairing` → phase 2
- `reviewing` → phase 3
- `images` → phase 4
- `enriching`, `storage_write`, `catalog_update`, `verifying` → phase 5
- `done` → phase 6
- `processing` (fallback) → phase 2

## E2E Test Pattern

```typescript
test('phases advance on job_events', async ({ page }) => {
  // 1. Create job via test helper
  const jobId = await page.evaluate(async () => {
    const token = getAuthToken(); // extract from localStorage
    const resp = await fetch('/functions/v1/test-create-job', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Test', grade: '3-5', items_per_group: 12, mode: 'options' })
    });
    const { job } = await resp.json();
    return job.id;
  });

  // 2. Navigate with jobId param for deterministic selection
  await page.goto(`/admin/ai-pipeline?jobId=${jobId}`);

  // 3. Wait for stepper to render
  await expect(page.locator('[data-testid="phase-generate"]')).toBeVisible({ timeout: 20000 });

  // 4. Emit steps and assert transitions
  await emitStep(page, 'generating', 10, jobId);
  await expect(page.locator('[data-testid="phase-generate"]')).toHaveAttribute('data-status', /active|complete/);

  await emitStep(page, 'validating', 40, jobId);
  await expect(page.locator('[data-testid="phase-validate"]')).toHaveAttribute('data-status', /active/);

  await emitStep(page, 'repairing', 60, jobId);
  await expect(page.locator('[data-testid="phase-repair"]')).toHaveAttribute('data-status', /active/);

  await emitStep(page, 'done', 100, jobId);
  await expect(page.locator('[data-testid="phase-generate"]')).toHaveAttribute('data-status', /complete/);
});
```

## Observability

### last_event_at
The `ai_course_jobs.last_event_at` column is automatically updated when job_events are inserted. Use it for:
- Sorting jobs by recent activity
- Health checks for stale jobs
- Efficient "active jobs" queries

```sql
SELECT * FROM ai_course_jobs
WHERE last_event_at > NOW() - INTERVAL '1 hour'
ORDER BY last_event_at DESC;
```

### Event Ordering
Always order `job_events` by `seq` (not `created_at`) for deterministic ordering:

```typescript
const { data } = await supabase
  .from('job_events')
  .select('*')
  .eq('job_id', jobId)
  .order('seq', { ascending: true });
```

## Performance Optimizations

### Lazy Loading

The RightInspector components (LiveLogs, SystemHealth) are lazy-loaded using React.lazy() and Suspense to reduce initial bundle size and improve page load times.

### Prefetching

Job data is prefetched on hover in job lists (ActiveJobsList, RecentJobsList) to provide instant navigation when users click on a job. This uses the `usePipelineJob` hook with an `enabled` flag.

### Skeleton Loading States

Custom skeleton components are used throughout the UI to provide visual feedback during loading:
- `JobCardSkeleton` - for job lists
- `TimelineSkeleton` - for timeline components  
- `MetricSkeleton` - for metric cards
- Inline skeletons in OverviewTab

These improve perceived performance and reduce layout shift.

## Rate Limiting & Quotas

### Database-Level Rate Limits

Rate limits are enforced at the database level via the `check_job_rate_limit()` trigger function:
- **Hourly limit**: 10 jobs per hour
- **Daily limit**: 50 jobs per day

Rate limits are bypassed for:
- Service role operations
- Test mode (`app.test_mode = true`)

### Quota Monitoring

Users can view their current quota usage via:
1. **UI Display**: QuickStartPanel shows real-time hourly/daily usage with progress bars
2. **Database View**: `user_job_quota` view provides quota info via SQL
3. **Hook**: `useJobQuota()` hook for React components

The quota display refreshes every 60 seconds and shows visual warnings when limits are approached.

### Adjusting Rate Limits

To modify rate limits, edit migration `20251114100000_job_rate_limits.sql`:

```sql
hourly_limit INT := 10; -- Change to desired limit
daily_limit INT := 50;  -- Change to desired limit
```

Then reapply the migration or update the function directly in Supabase.

## Production Deployment

1. **Remove test helpers**: Ensure `TEST_MODE` and `DEV_MODE` are not set in production
2. **Configure trigger settings**: Set `app.supabase_url` and `app.service_role_key` via Supabase settings
3. **Verify RLS**: Confirm users can only see their own jobs
4. **Enable triggers**: Ensure `app.test_mode` is not set (or set to `'false'`)
5. **Review rate limits**: Adjust hourly/daily limits based on expected usage patterns
6. **Test quota enforcement**: Verify rate limit errors display correctly in UI
