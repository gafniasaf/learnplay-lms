# Job Queue Operations Runbook

## Overview

This runbook documents operational procedures for monitoring and managing the AI job queue system (course generation and media generation).

## Architecture

```
Client (Browser) → ai_course_jobs table → ai-job-runner (cron/manual) → generate-course → Storage + Catalog
Client (Browser) → ai_media_jobs table → ai-media-runner (cron/manual) → OpenAI/etc → Storage
```

## Job Lifecycle

### Normal Flow
1. **Pending:** Job created by user, waiting for worker
2. **Processing:** Worker locked job, currently executing
3. **Done:** Job completed successfully, result in Storage

### Failure Flow
4. **Failed:** Job encountered error, will retry if `retry_count < max_retries`
5. **Dead Letter:** Job exhausted max retries (3), requires manual intervention
6. **Stale:** Job heartbeat timeout (>5 min), worker may have crashed

## Monitoring

### Edge Function Schedules (Cron)

Set up two schedules in Supabase Studio to keep the queue flowing and state self-healing. The CLI currently doesn’t create schedules, so use the Dashboard once.

1) jobs-reconciler (auto-heal and drift correction)
- Navigate: Edge Functions → Schedules → New schedule
- Function: jobs-reconciler
- Cron: `* * * * *` (every minute)
- Method: GET
- Name: jobs-reconciler-every-minute
- Click “Run now” once to verify

2) ai-job-batch-runner (periodic workers)
- Navigate: Edge Functions → Schedules → New schedule
- Function: ai-job-batch-runner
- Cron: `* * * * *` (every minute)
- Method: GET (or POST)
- Name: ai-job-batch-runner-every-minute
- Concurrency: Use query `?n=3` or rely on the `WORKER_CONCURRENCY` secret (recommended). We set `WORKER_CONCURRENCY=3`.
- Click “Run now” once to verify

Verification
- Edge Logs → filter by Service “edge-function”, function = jobs-reconciler and ai-job-batch-runner; you should see minute-by-minute runs.
- In `/admin/jobs`, refresh and observe jobs move from pending → processing → done/failed automatically, with stuck jobs corrected by the reconciler.

Troubleshooting
- If jobs-reconciler returns 500, check Edge Logs. Common causes:
  - Selecting non-existent columns. Fixed: uses `last_heartbeat`/`created_at` instead of `updated_at`, and avoids non-existent `failure_code`.
  - Storage/catalog read failures. Ensure the `courses` bucket exists and `catalog.json` is readable by the service role.

### Jobs Dashboard

**URL:** `/admin/jobs?live=1`

**Features:**
- Real-time job status (pending, processing, done, failed, dead_letter, stale)
- Metrics cards: count and avg duration per status
- Recent jobs table (last 50)
- Actions: Refresh, Mark Stale, Move to Dead Letter, Requeue

### Database Queries

**Check queue depth:**
```sql
select status, count(*) 
from ai_course_jobs 
group by status;
```

**Find stuck jobs:**
```sql
select id, subject, status, last_heartbeat, now() - last_heartbeat as stale_for
from ai_course_jobs
where status = 'processing'
  and last_heartbeat < now() - interval '5 minutes'
order by last_heartbeat asc;
```

**View metrics:**
```sql
select * from ai_job_metrics
order by job_type, status;
```

**Check rate limit violations:**
```sql
select created_by, count(*) as jobs_last_hour
from ai_course_jobs
where created_at > now() - interval '1 hour'
group by created_by
having count(*) > 10
order by jobs_last_hour desc;
```

## Common Operations

### Mark Stale Jobs

**When:** Processing jobs haven't sent heartbeat in >5 minutes

**Dashboard:**
1. Navigate to `/admin/jobs`
2. Click "Mark Stale" button
3. Confirm operation

**SQL:**
```sql
select * from mark_stale_jobs();
```

**Expected Output:**
```
job_id | job_type | stale_duration
-------|----------|---------------
uuid-1 | course   | 00:07:23
```

### Move to Dead Letter

**When:** Failed jobs have exhausted max_retries

**Dashboard:**
1. Navigate to `/admin/jobs`
2. Click "Move to Dead Letter" button
3. Review moved jobs

**SQL:**
```sql
select * from move_to_dead_letter();
```

### Requeue Job

**When:** Need to retry a failed/dead/stale job

**Dashboard:**
1. Find job in table
2. Click requeue button (↻ icon)
3. Job moves to pending status

**SQL:**
```sql
select requeue_job('job-uuid-here', 'ai_course_jobs');
```

**Validation:**
```sql
select id, status, retry_count, error
from ai_course_jobs
where id = 'job-uuid-here';
-- Should show status='pending', retry_count=0, error=null
```

### Manual Job Trigger

**When:** Need to force processing of pending jobs

**Edge Function:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/ai-job-runner \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Response (success):**
```json
{
  "processed": true,
  "jobId": "uuid",
  "courseId": "algebra-basics",
  "resultPath": "algebra-basics/course.json",
  "metrics": {
    "totalDurationMs": 45230,
    "generationDurationMs": 38500
  }
}
```

**Response (no jobs):**
```json
{
  "processed": false,
  "message": "No pending jobs"
}
```

## Troubleshooting

### Symptom: Jobs stuck in "processing"

**Diagnosis:**
```sql
select id, subject, started_at, last_heartbeat, 
       now() - last_heartbeat as heartbeat_age
from ai_course_jobs
where status = 'processing';
```

**Cause 1:** Worker crashed or edge function timeout

**Solution:**
1. Run `mark_stale_jobs()` to mark them as stale
2. Requeue stale jobs
3. Check edge function logs for crashes

**Cause 2:** Long-running generation (>5 min)

**Solution:**
- Wait for job to complete (OpenAI can take 1-2 minutes per course)
- Increase heartbeat interval if needed
- Consider reducing `itemsPerGroup` for faster generation

---

### Symptom: High failure rate

**Diagnosis:**
```sql
select 
  count(*) filter (where status = 'failed') as failed,
  count(*) filter (where status = 'done') as done,
  round(100.0 * count(*) filter (where status = 'failed') / count(*), 2) as failure_rate
from ai_course_jobs
where created_at > now() - interval '24 hours';
```

**Cause 1:** AI provider API key invalid

**Solution:**
1. Verify `OPENAI_API_KEY` in Supabase Edge Functions settings
2. Test key: `curl https://api.openai.com/v1/models -H "Authorization: Bearer YOUR_KEY"`
3. Rotate key if invalid (see [SECRETS_ROTATION.md](./SECRETS_ROTATION.md))

**Cause 2:** AI provider rate limiting

**Solution:**
1. Check provider dashboard for rate limits
2. Reduce job submission rate
3. Upgrade provider tier
4. Switch to fallback provider (Anthropic)

**Cause 3:** Schema validation failures

**Solution:**
1. Review error messages in `ai_course_jobs.error` column
2. Check if AI is generating invalid JSON
3. Update prompt in `generate-course/index.ts` for stricter guidance

---

### Symptom: Jobs in "dead_letter"

**Diagnosis:**
```sql
select id, subject, retry_count, error
from ai_course_jobs
where status = 'dead_letter'
order by completed_at desc
limit 10;
```

**Common Errors:**
- "Course generation failed: timeout" → OpenAI taking >50s
- "Schema validation failed" → AI output doesn't match schema
- "Storage upload failed" → Supabase Storage issue

**Solution:**
1. Review error message
2. Fix root cause (increase timeout, improve prompt, check storage permissions)
3. Requeue job: `select requeue_job('job-uuid', 'ai_course_jobs');`

---

### Symptom: Rate limit exceeded (10 jobs/hour)

**Diagnosis:**
```sql
select created_by, count(*) as jobs_submitted
from ai_course_jobs
where created_at > now() - interval '1 hour'
group by created_by
order by jobs_submitted desc;
```

**Cause:** User submitting too many jobs

**Solution (immediate):**
- Jobs will fail insert with RLS policy violation
- User sees error toast: "Rate limit exceeded"

**Solution (if abuse):**
1. Contact user
2. Temporarily increase `max_retries` to 0 for that user (requires custom policy)
3. Consider org-level rate limiting

---

### Symptom: Storage write failures

**Diagnosis:**
- Supabase Dashboard → Project → Edge Functions → `ai-job-runner` → Logs  
  Search for: `Storage upload failed`

Note: The repo-pinned Supabase CLI may not include `supabase functions logs` in all versions.

**Cause:** Supabase Storage permissions or quota

**Solution:**
1. Verify `courses` bucket exists and is public
2. Check Storage quota in Supabase Dashboard
3. Verify service role key has storage permissions
4. Test upload manually:
   ```bash
   curl -X POST https://your-project.supabase.co/storage/v1/object/courses/test.json \
     -H "Authorization: Bearer SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

## Performance Optimization

### Reduce Job Processing Time

**Current bottlenecks:**
1. AI generation: 30-60s (depends on provider, item count)
2. Storage write: 1-2s
3. Catalog update: 1-3s

**Optimization strategies:**
- Reduce `itemsPerGroup` (e.g., 12 → 6)
- Use Anthropic (faster, cheaper)
- Batch catalog updates (update once per N jobs)
- Cache generated courses for similar prompts

### Scale Workers

**Current:** Single edge function invocation per job

**Future improvements:**
- Add cron trigger: run `ai-job-runner` every 1 minute
- Add webhook trigger: invoke on job insert
- Parallel processing: multiple workers (requires distributed locking)

## Alerting

### Recommended Alerts

**Critical Alerts:**
1. Dead letter count > 5 in 1 hour → Investigate provider issues
2. Processing jobs with stale heartbeat > 3 → Workers may be crashing
3. Pending queue depth > 20 → Need more worker capacity

**Warning Alerts:**
1. Avg processing time > 90s → Provider may be slow
2. Failed jobs > 10% in 1 hour → Check provider status
3. Rate limit violations > 5/hour → User education needed

### Sentry Integration

Errors are automatically captured with:
- **Tag:** `function: ai-job-runner`
- **Tag:** `request_id: <uuid>`
- **Extra:** jobId, courseId, retryCount, error details

## Maintenance

### Weekly Tasks
- [ ] Review dead_letter jobs and requeue or delete
- [ ] Check avg processing times for regressions
- [ ] Review rate limit violations
- [ ] Clear jobs older than 90 days (retention policy)

### Monthly Tasks
- [ ] Analyze provider telemetry for cost optimization
- [ ] Review failure patterns and update prompts
- [ ] Test fallback providers
- [ ] Update this runbook with lessons learned

## Emergency Procedures

### All Jobs Failing

1. **Check provider status:**
   - OpenAI: https://status.openai.com
   - Anthropic: https://status.anthropic.com

2. **Verify API keys:**
   ```bash
   # Test OpenAI
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   
   # Test Anthropic
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "content-type: application/json" \
     -H "anthropic-version: 2023-06-01" \
     -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":100,"messages":[{"role":"user","content":"test"}]}'
   ```

3. **Switch provider priority:**
   ```env
   AI_PROVIDER_PRIORITY=anthropic,openai  # Use Anthropic first
   ```

4. **Enable placeholder mode** (temporary):
   ```env
   ALLOW_PLACEHOLDER=1  # Returns mock courses
   ```

### Database Issues

**Symptom:** Can't insert jobs, RLS errors

**Solution:**
1. Check RLS policies: `select * from pg_policies where tablename = 'ai_course_jobs';`
2. Verify rate limit function works: `select check_ai_job_rate_limit(auth.uid());`
3. Check table exists: `\d ai_course_jobs` in psql

## References

- [Phase 1 Migration](../../supabase/migrations/20251023000000_phase1_security_enhancements.sql) - ai_media_jobs, RLS, rate limiting
- [Phase 2 Migration](../../supabase/migrations/20251023000001_phase2_job_resilience.sql) - Retries, heartbeats, dead-letter
- [AI Providers Documentation](./AI_PROVIDERS.md) - Provider configuration and fallback
- [Secrets Rotation](./SECRETS_ROTATION.md) - API key rotation procedures

