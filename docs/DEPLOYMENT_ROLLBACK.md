# Deployment and Rollback Strategy

## Deployment Flow

### Lovable Cloud Auto-Deployment

**Trigger:** Push to `main` branch

**Process:**
1. GitHub receives push
2. Lovable webhook triggers build
3. Frontend builds (Vite)
4. Edge functions deploy
5. Preview URL updates: `https://your-uuid.lovableproject.com`
6. Production URL updates (if configured): `https://yourapp.lovable.app`

**Duration:** ~2-3 minutes

### Manual Edge Function Deployment

```bash
# Deploy all functions
npx supabase functions deploy

# Deploy specific function
npx supabase functions deploy ai-job-runner

# Deploy with specific project
npx supabase functions deploy --project-ref YOUR_PROJECT_ID
```

## Rollback Procedures

### Scenario 1: Bad Frontend Deploy

**Symptoms:**
- White screen / blank page
- Console errors on load
- Features not working

**Rollback Steps:**
1. **Identify last good commit:**
   ```bash
   git log --oneline -10
   ```

2. **Revert to last good commit:**
   ```bash
   git revert HEAD --no-edit
   git push origin main
   ```

3. **Wait for auto-deploy** (~2 min)

4. **Verify fix:**
   - Navigate to preview URL
   - Check `/dev/diagnostics`
   - Test critical user flows

**Alternative: Force revert multiple commits:**
```bash
# Revert last 3 commits
git revert HEAD~2..HEAD --no-edit
git push origin main
```

---

### Scenario 2: Bad Edge Function Deploy

**Symptoms:**
- API errors (500, 502, 504)
- Job queue not processing
- AI generation failing

**Rollback Steps:**
1. **Check edge function logs:**
   ```bash
   npx supabase functions logs ai-job-runner --limit 50
   ```

2. **Identify error** (syntax error, missing env var, etc.)

3. **Quick fix** if simple:
   ```bash
   # Edit function file
   git add supabase/functions/ai-job-runner/
   git commit -m "fix: edge function syntax error"
   git push origin main
   ```

4. **Or revert code:**
   ```bash
   git revert <bad-commit-hash> --no-edit
   git push origin main
   ```

5. **Force redeploy if needed:**
   ```bash
   npx supabase functions deploy ai-job-runner
   ```

---

### Scenario 3: Bad Database Migration

**Symptoms:**
- RLS policy errors
- Missing columns
- Jobs failing to insert

**Rollback Steps:**

⚠️ **WARNING:** Database rollbacks are destructive. Backup first.

1. **Backup current state:**
   ```bash
   npx supabase db dump > backup-$(date +%Y%m%d-%H%M%S).sql
   ```

2. **Create rollback migration:**
   ```sql
   -- supabase/migrations/20251023000002_rollback_phase2.sql
   
   -- Revert status enum
   alter table public.ai_course_jobs
     drop constraint if exists ai_course_jobs_status_check;
   
   alter table public.ai_course_jobs
     add constraint ai_course_jobs_status_check
     check (status in ('pending', 'processing', 'done', 'failed'));
   
   -- Drop new columns
   alter table public.ai_course_jobs
     drop column if exists retry_count,
     drop column if exists max_retries,
     drop column if exists last_heartbeat;
   ```

3. **Apply rollback:**
   ```bash
   npx supabase db push
   ```

4. **Verify tables:**
   ```sql
   \d ai_course_jobs  -- Check schema
   select * from ai_course_jobs limit 5;  -- Check data
   ```

**Prevention:**
- Always test migrations in staging first
- Use transactions where possible
- Document rollback SQL alongside forward migration

---

### Scenario 4: Bad Environment Variable Change

**Symptoms:**
- Auth failing
- CORS errors
- Provider API calls failing

**Rollback Steps:**
1. **Check Lovable environment variables:**
   - Dashboard → Settings → Environment Variables

2. **Restore previous value** from git history:
   ```bash
   # Find when var was changed
   git log --all --grep="env" --oneline -10
   
   # View old .env.example
   git show <commit-hash>:.env.example
   ```

3. **Update in Lovable Dashboard**
   - Change variable back to previous value
   - Save (triggers auto-redeploy)

4. **Verify:**
   - Wait 2-3 minutes for redeploy
   - Check `/dev/diagnostics`

---

## Feature Flags

### Concept

Instead of rolling back, use feature flags to disable problematic features:

```typescript
// src/lib/featureFlags.ts
export function isFeatureEnabled(feature: string): boolean {
  const flags = import.meta.env.VITE_FEATURE_FLAGS?.split(',') || [];
  return flags.includes(feature);
}

// Usage
if (isFeatureEnabled('new-dashboard')) {
  // Show new dashboard
} else {
  // Show old dashboard (safe fallback)
}
```

### Environment Variable

```env
# Enable specific features
VITE_FEATURE_FLAGS=new-dashboard,ai-media-gen,advanced-analytics
```

### Benefits
- **No code deploy** needed to disable feature
- **Gradual rollout** (enable for subset of users)
- **A/B testing** capability
- **Instant rollback** (just remove from flags)

---

## Canary Deployments (Future)

For high-risk changes:

1. **Deploy to canary environment first**
2. **Route 5% of traffic** to canary
3. **Monitor metrics** for 1 hour
4. **Full rollout** if metrics healthy
5. **Instant rollback** if errors spike

---

## Monitoring Post-Deployment

### First 15 Minutes

- [ ] Check Sentry for error spikes
- [ ] Verify `/dev/diagnostics` shows green
- [ ] Test critical user flow (login → play course)
- [ ] Check job queue processing
- [ ] Verify no console errors in browser

### First Hour

- [ ] Review job queue metrics
- [ ] Check AI provider error rates
- [ ] Monitor response times
- [ ] Verify no RLS policy violations
- [ ] Check database query performance

### First 24 Hours

- [ ] Review daily error summary in Sentry
- [ ] Check cost metrics (AI provider spend)
- [ ] Analyze user behavior (any confusion?)
- [ ] Review support tickets/feedback
- [ ] Update runbook with lessons learned

---

## Emergency Contacts

- **On-Call Engineer:** [PagerDuty rotation]
- **Lovable Support:** support@lovable.dev
- **Supabase Support:** https://supabase.com/support
- **Security Incidents:** security@yourcompany.com

---

## Rollback Decision Matrix

| Severity | Symptoms | Action | Timeframe |
|----------|----------|--------|-----------|
| **Critical** | Auth broken, data loss, security breach | Immediate rollback | <5 min |
| **High** | Feature broken, >20% error rate | Rollback or quick fix | <30 min |
| **Medium** | Minor feature issue, <5% error rate | Fix forward | <2 hours |
| **Low** | Visual bug, no functional impact | Fix in next deploy | <24 hours |

---

## Testing Before Deploy

### Pre-Push Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all Jest suites)
- [ ] `npm run e2e` passes (mock mode)
- [ ] `npm run build` succeeds with no errors
- [ ] Manual smoke test in `npm run preview`

### High-Risk Changes Checklist

For database migrations, edge function rewrites, or auth changes:

- [ ] Test in local Supabase instance first
- [ ] Document rollback procedure before deploy
- [ ] Notify team in Slack #deploys channel
- [ ] Deploy during low-traffic hours
- [ ] Have rollback commit prepared
- [ ] Monitor for first 1 hour post-deploy

---

## References

- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [docs/JOB_QUEUE_OPERATIONS.md](./JOB_QUEUE_OPERATIONS.md) - Job queue troubleshooting
- [docs/SECRETS_ROTATION.md](./SECRETS_ROTATION.md) - Env var management

