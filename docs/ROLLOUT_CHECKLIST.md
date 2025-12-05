# Multi-Tenant Rollout Checklist

**Version:** 1.0  
**Date:** 2025-10-25  
**Target:** Production Deployment

---

## Pre-Deployment Checklist

### Code Quality
- [x] All phases complete (1-12)
- [x] TypeScript type checking passes (`npm run typecheck`)
- [x] Linting passes (`npm run lint`)
- [x] Unit tests passing (`npm run test`)
- [x] E2E tests passing (`npm run e2e`)
- [x] Build succeeds (`npm run build`)

### Database
- [ ] All 5 migrations reviewed
- [ ] Migrations tested on staging database
- [ ] Backfill script tested
- [ ] RLS policies verified
- [ ] Seed data validated

### Edge Functions
- [ ] All 5 functions reviewed:
  - org-config
  - list-courses-filtered
  - publish-course
  - restore-course-version
  - regenerate-embeddings
- [ ] Functions tested locally
- [ ] Environment variables configured
- [ ] CORS headers verified

### Frontend
- [ ] Tag Management UI tested
- [ ] Tag Approval Queue tested
- [ ] CourseSelector filtering tested
- [ ] Version History page tested
- [ ] Variant resolution tested

### Documentation
- [x] HOW_TO_RUN.md complete
- [x] TECHNICAL_INFO.md complete
- [x] DISASTER_RECOVERY.md complete
- [x] LOVABLE_DEPLOYMENT_INSTRUCTIONS.md complete
- [x] API documentation updated

---

## Staging Deployment

### Step 1: Database Migration
```bash
# Link to staging project
supabase link --project-ref staging-project-ref

# Apply migrations
supabase db push

# Verify tables created
supabase db shell
> SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%organization%' OR tablename LIKE '%tag%' OR tablename LIKE '%course_%';
```

**Validation:**
- [ ] 8 new tables created
- [ ] RLS enabled on all tables
- [ ] Default org created
- [ ] Global tags seeded

### Step 2: Run Backfill
```bash
# Set staging env vars
export VITE_SUPABASE_URL=https://staging.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=staging-service-key

# Run backfill
npm run backfill:metadata

# Check report
cat reports/backfill-metadata-*.md
```

**Validation:**
- [ ] All courses have course_metadata rows
- [ ] Tag suggestions in approval queue
- [ ] No errors in backfill report

### Step 3: Deploy Edge Functions
```bash
# Deploy all functions
supabase functions deploy org-config
supabase functions deploy list-courses-filtered
supabase functions deploy publish-course
supabase functions deploy restore-course-version
supabase functions deploy regenerate-embeddings
```

**Validation:**
- [ ] All functions deployed successfully
- [ ] Test each endpoint with curl
- [ ] Check function logs for errors

### Step 4: Deploy Frontend
```bash
# Build for staging
npm run build

# Deploy to hosting provider (Vercel/Netlify/etc.)
# ... follow provider instructions
```

**Validation:**
- [ ] Site accessible
- [ ] All routes load
- [ ] No console errors

### Step 5: Smoke Testing
```bash
# Run E2E tests against staging
PLAYWRIGHT_BASE_URL=https://staging.yoursite.com npm run e2e
```

**Test Checklist:**
- [ ] Login works
- [ ] Tag Management loads
- [ ] Tag Approval Queue loads
- [ ] CourseSelector loads courses
- [ ] Can toggle metadata/catalog mode
- [ ] Version History loads
- [ ] No RLS violations in logs

---

## Production Deployment

### Step 1: Final Checks
- [ ] All staging tests passed
- [ ] No critical bugs reported
- [ ] Performance benchmarks met
- [ ] Security audit complete
- [ ] Backup procedures tested

### Step 2: Database Migration
```bash
# Link to production
supabase link --project-ref production-project-ref

# Apply migrations
supabase db push

# Verify
supabase db shell
> SELECT COUNT(*) FROM organizations;
> SELECT COUNT(*) FROM tags WHERE organization_id IS NULL;
```

### Step 3: Run Backfill
```bash
# Production backfill
export VITE_SUPABASE_URL=https://production.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=production-service-key

npm run backfill:metadata

# Archive report
cp reports/backfill-metadata-*.md artifacts/production-backfill-$(date +%Y%m%d).md
```

### Step 4: Deploy Edge Functions
```bash
# Deploy to production
supabase functions deploy --project-ref production-project-ref
```

### Step 5: Deploy Frontend
```bash
# Build production
npm run build

# Deploy to production hosting
# ... provider-specific steps
```

### Step 6: Smoke Test Production
```bash
# Quick smoke tests
curl https://api.yoursite.com/functions/v1/org-config \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check homepage loads
curl https://yoursite.com/
```

### Step 7: Monitor
- [ ] Check Sentry for errors (first 1 hour)
- [ ] Check function logs
- [ ] Check database load
- [ ] Check cache hit rates
- [ ] Verify no RLS violations

---

## Post-Deployment

### Immediate (First 24 Hours)
- [ ] Monitor error rates in Sentry
- [ ] Check edge function logs
- [ ] Verify database queries performing well
- [ ] Check user feedback

### Week 1
- [ ] Review performance metrics
- [ ] Check cache hit rates
- [ ] Validate tag approval workflow
- [ ] Collect user feedback
- [ ] Fix any critical bugs

### Week 2-4
- [ ] Onboard 2-3 pilot organizations
- [ ] Gather feedback on tag management
- [ ] Test variant switching in production
- [ ] Optimize slow queries if needed

---

## Rollback Plan

### If Critical Issue Found

**Immediate Actions:**
1. Enable maintenance mode
2. Investigate issue in logs
3. Decide: hotfix or rollback

**Rollback Procedure:**

```bash
# 1. Revert database migrations (if needed)
supabase migration repair --status reverted 20251025200004
supabase migration repair --status reverted 20251025200003
# ... continue in reverse order

# 2. Restore from backup
psql $DATABASE_URL < backup/pre-migration.sql

# 3. Rollback edge functions
supabase functions delete org-config
supabase functions delete list-courses-filtered
supabase functions delete publish-course
supabase functions delete restore-course-version
supabase functions delete regenerate-embeddings

# 4. Redeploy previous frontend version
git revert HEAD~5..HEAD
npm run build
# ... deploy
```

---

## Success Criteria

### Must Have (Week 1)
- [ ] Zero RLS violations (cross-org data leaks)
- [ ] Tag Management UI functional
- [ ] CourseSelector filters working
- [ ] Version History accessible
- [ ] No P1 bugs

### Should Have (Week 4)
- [ ] 2-3 pilot orgs onboarded
- [ ] Tag approval workflow validated
- [ ] Variant switching tested
- [ ] Performance targets met (<2s course load)
- [ ] Cache hit rate > 70%

### Nice to Have (Month 1)
- [ ] 10+ organizations using system
- [ ] Positive user feedback
- [ ] < 5 support tickets
- [ ] Monitoring dashboards set up

---

## Communication Plan

### Before Deployment
- Email all users 24h in advance
- Post announcement on status page
- Prepare support team

### During Deployment
- Post updates every 30 minutes
- Monitor #incidents channel
- Keep rollback option ready

### After Deployment
- Send "all clear" email
- Post-mortem meeting (within 48h)
- Document lessons learned
- Update runbooks

---

## Contacts

### On-Call Rotation
- **Engineering:** [Contact]
- **DevOps:** [Contact]
- **Support:** [Contact]

### Escalation
- **P1 (Critical):** Immediate escalation to engineering lead
- **P2 (High):** Escalate within 2 hours
- **P3 (Medium):** Next business day

---

## Monitoring Dashboards

### Create These Dashboards

1. **Multi-Tenant Health**
   - Org count
   - Active users per org
   - RLS violation attempts
   - Tag approval queue depth

2. **Performance**
   - Course load latency (p50, p95, p99)
   - Tag filter query time
   - Publish duration
   - Cache hit rate

3. **Usage**
   - Courses published per day
   - Tags created per week
   - Version restores per month
   - Variant level distribution

---

## Phase 12 Completion Criteria

- [x] Deployment checklist reviewed
- [x] Rollback plan documented
- [ ] Staging validated
- [ ] Production deployed
- [ ] Monitoring active
- [ ] No critical issues for 1 week

---

**Status:** Ready for deployment  
**Owner:** Engineering Team  
**Review Date:** 2025-10-25

