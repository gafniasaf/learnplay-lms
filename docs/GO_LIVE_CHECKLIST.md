# Go-Live Checklist

**Project:** LearnPlay Platform  
**Target Date:** TBD  
**Environment:** Production

## Pre-Launch (2 Weeks Before)

### Infrastructure

- [ ] **Supabase Production Project** created and configured
- [ ] **Database migrations** applied: `npx supabase db push`
- [ ] **RLS policies** verified for all tables
- [ ] **Storage buckets** created (`courses`, `media`) and permissions set
- [ ] **Edge functions** deployed: `npx supabase functions deploy`
- [ ] **Environment variables** configured in Lovable production settings:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_PUBLISHABLE_KEY`
  - [ ] `VITE_USE_STORAGE_READS=true` (recommended)
  - [ ] `VITE_SENTRY_DSN`
- [ ] **Edge function secrets** configured in Supabase:
  - [ ] `OPENAI_API_KEY`
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `SENTRY_DSN`
  - [ ] `AI_PROVIDER_PRIORITY=openai,anthropic`

### Security

- [ ] **SSL/TLS** configured (auto via Lovable)
- [ ] **Content Security Policy** headers active (verify in browser DevTools)
- [ ] **CORS origins** restricted in production (remove wildcards)
- [ ] **API keys rotated** before launch (see [SECRETS_ROTATION.md](./SECRETS_ROTATION.md))
- [ ] **Rate limiting** tested (submit 11 jobs in 1 hour → should fail)
- [ ] **Sentry error tracking** configured and capturing test errors
- [ ] **Auth Site URL** set to production domain in Supabase Auth settings

### Testing

- [ ] **All Jest tests** passing: `npm test`
- [ ] **All E2E tests** passing: `npm run e2e`
- [ ] **Typecheck** passing: `npm run typecheck`
- [ ] **Coverage thresholds** met (90% lines, 90% functions)
- [ ] **Manual smoke test** completed on preview:
  - [ ] Login/logout flow
  - [ ] Browse courses
  - [ ] Play a course (at least 5 questions)
  - [ ] AI course generation (end-to-end)
  - [ ] Parent dashboard (all time ranges)
  - [ ] Student dashboard (all tabs)
  - [ ] Admin job queue dashboard
  - [ ] Messaging system
- [ ] **Accessibility audit** with Lighthouse (score >90)
- [ ] **Performance audit** with Lighthouse (score >80)
- [ ] **Mobile responsiveness** tested on iOS and Android

### Content

- [ ] **Initial courses** uploaded to Storage (at least 10 courses)
- [ ] **Catalog populated** with metadata
- [ ] **Mock profiles** created for all roles (student, teacher, parent, admin)
- [ ] **Sample classes** and assignments created
- [ ] **Help documentation** reviewed and updated

### Monitoring

- [ ] **Sentry project** created and DSN configured
- [ ] **Sentry alerts** configured:
  - [ ] Error rate >5% in 15 min
  - [ ] Job queue failures >10 in 1 hour
  - [ ] New error type appears
- [ ] **Uptime monitoring** (optional: UptimeRobot, Pingdom)
- [ ] **Status page** prepared (optional)

---

## Launch Day (Go-Live)

### 1 Hour Before

- [ ] **Team standup** - everyone aware and available
- [ ] **Backup database:**
  ```bash
  npx supabase db dump > backup-go-live-$(date +%Y%m%d-%H%M%S).sql
  ```
- [ ] **Final preview check:**
  - Navigate to preview URL
  - Run `/dev/diagnostics`
  - Submit test AI job
  - Verify all green

### Go-Live Steps

1. **Merge final changes to main:**
   ```bash
   git status  # Ensure clean
   git fetch origin
   git merge --ff-only origin/main
   git push origin main
   ```

2. **Wait for Lovable auto-deploy** (2-3 min)

3. **Verify production URL** is live:
   - Navigate to `https://yourapp.lovable.app`
   - Clear cache (Ctrl+Shift+R)
   - Login with test account

4. **Run diagnostics:**
   - `/dev/diagnostics?live=1`
   - Verify all API calls return 200 OK

5. **Smoke test critical paths:**
   - [ ] Login → Dashboard
   - [ ] Browse → Play course
   - [ ] Submit AI job → Wait for completion
   - [ ] Parent view child progress
   - [ ] Teacher view class

6. **Enable production monitoring:**
   - Open Sentry dashboard (watch for errors)
   - Open Supabase dashboard (watch logs)
   - Keep terminal open with logs

### First 30 Minutes

- [ ] **Monitor Sentry** for error spikes
- [ ] **Check job queue:** `/admin/jobs?live=1`
- [ ] **Verify first real user login** succeeds
- [ ] **Check AI generation** completes successfully
- [ ] **Monitor Supabase logs:**
  - Supabase Dashboard → Project → Edge Functions → `ai-job-runner` → Logs
  - Note: The repo-pinned Supabase CLI may not include `supabase functions logs` in all versions.

### First 2 Hours

- [ ] No critical errors in Sentry
- [ ] Job queue processing normally
- [ ] Users can complete courses
- [ ] Dashboards loading correctly
- [ ] No auth issues reported

### First 24 Hours

- [ ] Review error summary in Sentry
- [ ] Check job metrics: avg duration, success rate
- [ ] Review user feedback
- [ ] Monitor AI provider costs
- [ ] Verify database query performance

---

## Rollback Scenarios

### Rollback Decision Criteria

**Immediate Rollback** if:
- Authentication completely broken
- Data loss or corruption
- Security vulnerability discovered
- >50% error rate
- Production database inaccessible

**Fix Forward** if:
- <5% error rate
- Non-critical feature broken
- Visual bugs
- Performance degradation <20%

### Rollback Process

1. **Announce in team chat:**
   ```
   🚨 ROLLBACK IN PROGRESS
   Issue: [brief description]
   ETA: 5 minutes
   ```

2. **Execute rollback:**
   ```bash
   # Revert last commit
   git revert HEAD --no-edit
   git push origin main
   ```

3. **Verify rollback:**
   - Wait for Lovable redeploy (2-3 min)
   - Check production URL
   - Run diagnostics
   - Test affected feature

4. **Post-rollback:**
   - Update team: "Rollback complete, investigating root cause"
   - Create incident report
   - Fix issue in separate branch
   - Thorough testing before re-deploy

### Database Rollback

⚠️ **CRITICAL:** Database rollbacks may lose data. Only use as last resort.

**Process:**
1. **Stop all writes:**
   - Set `VITE_USE_MOCK=true` to prevent writes
   - Disable job runners

2. **Restore from backup:**
   ```bash
   # If you have a backup SQL file
   psql $DATABASE_URL < backup-YYYYMMDD.sql
   
   # Or via Supabase Dashboard:
   # Database → Backups → Restore to point in time
   ```

3. **Re-apply safe migrations:**
   ```bash
   npx supabase db push
   ```

4. **Re-enable writes**

---

## Feature Flags for Safe Deployment

### Implementing Feature Flags

```typescript
// src/lib/featureFlags.ts
export const FEATURES = {
  NEW_DASHBOARD: 'new-dashboard',
  AI_MEDIA_GEN: 'ai-media-gen',
  ADVANCED_ANALYTICS: 'advanced-analytics',
} as const;

export function isFeatureEnabled(feature: string): boolean {
  const flags = import.meta.env.VITE_FEATURE_FLAGS?.split(',') || [];
  return flags.includes(feature);
}

// Usage in component
import { isFeatureEnabled, FEATURES } from '@/lib/featureFlags';

function Dashboard() {
  const showNew = isFeatureEnabled(FEATURES.NEW_DASHBOARD);
  
  return showNew ? <NewDashboard /> : <OldDashboard />;
}
```

### Gradual Rollout

**Day 1:** Enable for internal team only
```env
VITE_FEATURE_FLAGS=new-dashboard  # Set for internal preview
```

**Day 3:** Enable for 10% of users (requires backend logic)

**Day 7:** Enable for 50% of users

**Day 14:** Enable for 100% (remove flag, make default)

---

## Post-Launch Monitoring

### Daily (First Week)

- [ ] Review Sentry error summary
- [ ] Check job queue metrics
- [ ] Monitor AI provider costs
- [ ] Review user feedback/support tickets
- [ ] Check database size growth

### Weekly (First Month)

- [ ] Run security scan
- [ ] Review performance metrics
- [ ] Check for dependency updates
- [ ] Analyze user engagement
- [ ] Update documentation with learnings

### Monthly (Ongoing)

- [ ] Rotate API keys (quarterly)
- [ ] Review and archive old jobs
- [ ] Update course catalog
- [ ] Dependency audit and updates
- [ ] Incident review and process improvements

---

## Success Criteria

Launch is considered successful when:

✅ **Stability:**
- <1% error rate for 72 hours
- All critical user flows working
- No P1 bugs reported

✅ **Performance:**
- Page load <3 seconds
- AI generation <90 seconds avg
- Job queue throughput >10 jobs/hour

✅ **Security:**
- No security incidents
- All auth flows working
- RLS policies enforced

✅ **User Satisfaction:**
- Positive feedback from pilot users
- Support ticket volume low
- Key metrics trending up

---

## Contacts

- **Platform Team Lead:** [Name]
- **On-Call Engineer:** [PagerDuty]
- **Lovable Support:** support@lovable.dev
- **Incident Channel:** #incidents (Slack)

---

## Appendix: Common Issues

### Issue: "Failed to fetch" on preview

**Cause:** CORS misconfiguration

**Fix:** Set `VITE_USE_STORAGE_READS=true`

### Issue: AI jobs stuck in "pending"

**Cause:** Edge function not running

**Fix:** Manually trigger: `curl -X POST https://your-project.supabase.co/functions/v1/ai-job-runner -H "Authorization: Bearer SERVICE_KEY"`

### Issue: Courses not loading

**Cause:** Catalog cache stale

**Fix:** Invalidate cache by uploading fresh `catalog.json`

---

## References

- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [docs/JOB_QUEUE_OPERATIONS.md](./JOB_QUEUE_OPERATIONS.md) - Operational procedures
- [docs/DEPLOYMENT_ROLLBACK.md](./DEPLOYMENT_ROLLBACK.md) - This document
- [docs/SECRETS_ROTATION.md](./SECRETS_ROTATION.md) - Key rotation procedures

