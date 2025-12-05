# Disaster Recovery Procedures

**Version:** 1.0  
**Last Updated:** 2025-10-25  
**Critical:** Review quarterly

---

## Overview

This document outlines procedures for recovering from catastrophic failures in the LearnPlay Platform. All procedures are designed to minimize data loss and downtime.

---

## Recovery Objectives

- **RTO (Recovery Time Objective):** < 4 hours
- **RPO (Recovery Point Objective):** < 24 hours (database), < 1 hour (courses via versions)

---

## Backup Systems

### 1. Database Backups (Supabase Automated)
- **Frequency:** Daily at 02:00 UTC
- **Retention:** 7 days (free tier), 30 days (Pro tier)
- **Location:** Supabase infrastructure (multi-region)
- **Access:** Supabase Dashboard → Settings → Database → Backups

### 2. Storage Backups (Multi-Region Replication)
- **Buckets:** `courses`, `media`, `profiles`
- **Replication:** Automatic across availability zones
- **Access:** Supabase Storage API

### 3. Course Version Snapshots
- **Frequency:** On every publish
- **Retention:** Indefinite
- **Location:** `course_versions` table
- **Restore:** Via `restore_course_version()` function

---

## Disaster Scenarios & Procedures

### Scenario 1: Corrupted Course Data

**Symptoms:**
- Course fails to load in Play flow
- JSON parse errors
- Missing items or malformed structure

**Recovery Steps:**

1. **Identify Affected Course:**
   ```sql
   SELECT id, content_version, etag, updated_at
   FROM course_metadata
   WHERE id = 'affected-course-id';
   ```

2. **List Available Versions:**
   ```sql
   SELECT * FROM list_course_versions('affected-course-id');
   ```

3. **Restore to Last Known Good Version:**
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/restore-course-version \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "courseId": "affected-course-id",
       "version": 3,
       "changelog": "Emergency restore due to data corruption"
     }'
   ```

4. **Verify Recovery:**
   - Load course in browser: `/play/affected-course-id`
   - Check course JSON in storage: `courses/affected-course-id.json`

**Prevention:**
- Never edit course JSON directly in storage
- Always use Course Editor or publish API
- Test changes in dev before publishing

---

### Scenario 2: Database Failure

**Symptoms:**
- All database queries fail
- "Connection refused" errors
- Supabase dashboard unreachable

**Recovery Steps:**

1. **Check Supabase Status:**
   - Visit https://status.supabase.com
   - Check your project dashboard

2. **If Supabase Outage:**
   - Wait for Supabase recovery (they have 99.9% SLA)
   - Monitor status page for updates
   - Enable maintenance mode page for users

3. **If Local Issue:**
   - Check firewall rules
   - Verify network connectivity
   - Restart Supabase connection pool

4. **If Database Corrupted:**
   - Contact Supabase support (support@supabase.io)
   - Request point-in-time recovery (PITR)
   - Restore from latest daily backup

**Manual Restore from Backup:**
```bash
# Download latest backup from Supabase dashboard
# Then restore locally
supabase db reset --db-url "postgresql://..."
psql $DATABASE_URL < backup.sql
```

---

### Scenario 3: Lost Course Versions

**Symptoms:**
- `course_versions` table empty or missing rows
- Cannot restore to previous version
- Version history UI shows no versions

**Recovery Steps:**

1. **Check if Table Exists:**
   ```sql
   SELECT EXISTS (
     SELECT FROM information_schema.tables 
     WHERE table_name = 'course_versions'
   );
   ```

2. **If Table Missing:**
   ```bash
   # Reapply migration
   supabase db push --file supabase/migrations/20251025200003_multi_tenant_course_metadata.sql
   ```

3. **If Rows Deleted:**
   - Restore from database backup (see Scenario 2)
   - Contact Supabase support for PITR

4. **Rebuild Missing Snapshots:**
   ```bash
   # For each course, create version 1 snapshot from current storage
   npm run rebuild-snapshots  # Script to be created
   ```

**Prevention:**
- Never manually DELETE from `course_versions`
- Regular database backups
- Monitor version count: `SELECT COUNT(*) FROM course_versions;`

---

### Scenario 4: Tag System Failure

**Symptoms:**
- Courses not appearing in catalog
- Tag filters return no results
- "Invalid tag IDs" errors on publish

**Recovery Steps:**

1. **Verify Tag Tables Exist:**
   ```sql
   SELECT tablename FROM pg_tables 
   WHERE tablename IN ('tag_types', 'tags', 'tag_approval_queue');
   ```

2. **Check Global Tags Seeded:**
   ```sql
   SELECT COUNT(*) FROM tags WHERE organization_id IS NULL;
   -- Should return > 10
   ```

3. **Re-seed Global Tags:**
   ```bash
   # Reapply tags migration
   supabase db push --file supabase/migrations/20251025200002_multi_tenant_tags.sql
   ```

4. **Rebuild course_metadata tag_ids:**
   ```sql
   -- For each course, validate tag_ids reference existing tags
   UPDATE course_metadata
   SET tag_ids = ARRAY(
     SELECT id FROM tags WHERE id = ANY(tag_ids)
   );
   ```

---

### Scenario 5: Organization Data Loss

**Symptoms:**
- Users cannot log in
- "Organization not found" errors
- Branding missing

**Recovery Steps:**

1. **Check Organizations Table:**
   ```sql
   SELECT id, name, slug FROM organizations;
   ```

2. **If Default Org Missing:**
   ```sql
   INSERT INTO organizations (id, name, slug, branding, settings)
   VALUES (
     '00000000-0000-0000-0000-000000000001',
     'LearnPlay',
     'learnplay',
     '{"logoUrl": "/placeholder.svg", "primaryColor": "#1E40AF"}',
     '{}'
   );
   ```

3. **If All Orgs Missing:**
   - Restore from database backup (see Scenario 2)
   - Reapply organization migration

4. **Rebuild User Roles:**
   ```sql
   -- Assign users to default org
   INSERT INTO user_roles (user_id, organization_id, role)
   SELECT id, '00000000-0000-0000-0000-000000000001', 'viewer'
   FROM auth.users
   WHERE id NOT IN (SELECT user_id FROM user_roles);
   ```

---

### Scenario 6: Media Storage Loss

**Symptoms:**
- Images/audio/video not loading
- 404 errors on media URLs
- Broken media in courses

**Recovery Steps:**

1. **Check Storage Buckets:**
   ```bash
   supabase storage list
   ```

2. **If Buckets Missing:**
   - Contact Supabase support immediately
   - Request storage restore from backup

3. **If Specific Files Missing:**
   - Check `media_assets` table for file metadata
   - Re-upload media via Media Manager
   - Or regenerate with AI (if DALL-E/TTS)

4. **Rebuild media_assets Table:**
   ```bash
   # Script to scan storage and rebuild metadata
   npm run rebuild-media-assets  # To be created
   ```

---

### Scenario 7: Complete System Failure

**Symptoms:**
- Frontend down
- Database down
- Storage down

**Recovery Steps:**

1. **Check All Systems:**
   - Supabase: https://status.supabase.com
   - Hosting (Vercel/Netlify): Check provider status
   - GitHub: Check repository accessible

2. **Enable Maintenance Mode:**
   ```html
   <!-- Deploy static maintenance page -->
   <h1>LearnPlay is temporarily unavailable</h1>
   <p>We're working to restore service. ETA: 2 hours</p>
   ```

3. **Restore from Backups:**
   - Database: Supabase PITR or daily backup
   - Frontend: Redeploy from GitHub
   - Edge Functions: Redeploy via CLI

4. **Verify Services:**
   ```bash
   # Check database
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM organizations;"
   
   # Check storage
   curl https://your-project.supabase.co/storage/v1/bucket/courses
   
   # Check edge functions
   curl https://your-project.supabase.co/functions/v1/org-config
   ```

---

## Data Export Procedures

### Export All Courses
```bash
# Download all course JSON files
supabase storage download --bucket courses --all --output backup/courses/

# Or via script
npm run export:courses  # To be created
```

### Export Database
```bash
# Full database dump
supabase db dump > backup/database-$(date +%Y%m%d).sql

# Specific tables
pg_dump $DATABASE_URL \
  -t organizations \
  -t course_metadata \
  -t course_versions \
  -t tags \
  -t tag_types \
  > backup/multi-tenant-$(date +%Y%m%d).sql
```

### Export Media
```bash
# Download all media
supabase storage download --bucket media --all --output backup/media/
```

---

## Rollback Procedures

### Rollback Database Migration
```bash
# If migration caused issues, restore from backup
psql $DATABASE_URL < backup/database-before-migration.sql

# Or manually revert specific migration
supabase migration repair --status reverted 20251025200003
```

### Rollback Edge Function Deployment
```bash
# Delete problematic function
supabase functions delete function-name

# Redeploy previous version from git
git checkout previous-commit
supabase functions deploy function-name
git checkout main
```

### Rollback Frontend Deployment
```bash
# Revert git commit
git revert HEAD

# Redeploy
git push origin main
# (CI/CD will auto-deploy reverted version)
```

---

## Emergency Contacts

### Supabase Support
- **Email:** support@supabase.io
- **Dashboard:** https://app.supabase.com/support
- **Status:** https://status.supabase.com

### Internal Team
- **Engineering Lead:** [Contact Info]
- **DevOps:** [Contact Info]
- **On-Call:** [Rotation Schedule]

---

## Post-Incident Checklist

After resolving incident:

- [ ] Document root cause
- [ ] Update runbooks
- [ ] Add monitoring/alerts to prevent recurrence
- [ ] Conduct post-mortem meeting
- [ ] Update disaster recovery procedures if needed
- [ ] Test recovery procedure in staging

---

## Testing Recovery Procedures

### Quarterly Drill Checklist

- [ ] Restore database from backup
- [ ] Restore course from version snapshot
- [ ] Export all data
- [ ] Test edge function rollback
- [ ] Test frontend rollback
- [ ] Verify monitoring alerts work
- [ ] Document lessons learned

---

## Appendix: Recovery Scripts

### Script: Rebuild Course Snapshots
```bash
#!/bin/bash
# scripts/rebuild-snapshots.sh

for course_id in $(supabase storage list courses | jq -r '.[].name' | sed 's/.json//'); do
  echo "Creating snapshot for $course_id..."
  
  # Download course JSON
  SNAPSHOT=$(supabase storage download --bucket courses --file "$course_id.json")
  
  # Insert into course_versions
  psql $DATABASE_URL <<SQL
    INSERT INTO course_versions (course_id, snapshot, published_by, changelog)
    SELECT
      '$course_id',
      '$SNAPSHOT'::jsonb,
      (SELECT id FROM auth.users LIMIT 1),
      'Rebuilt from storage backup'
    WHERE NOT EXISTS (
      SELECT 1 FROM course_versions WHERE course_id = '$course_id'
    );
SQL
done
```

---

**Status:** Active  
**Review Frequency:** Quarterly  
**Owner:** Engineering Team

