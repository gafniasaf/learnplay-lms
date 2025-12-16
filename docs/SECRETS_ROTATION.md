# Secrets Rotation Playbook

**Owner:** Platform Team  
**Last Updated:** 2025-10-23  
**Frequency:** Every 90 days or on suspected compromise

## Overview

This playbook documents the procedure for rotating all secrets and API keys used in the LearnPlay Platform. Regular rotation reduces the impact of potential key exposure.

## Secrets Inventory

### 1. Supabase Keys

**Location:** Lovable Cloud environment variables + local `.env`  
**Keys:**
- `VITE_SUPABASE_URL` (public, low risk)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (public, medium risk - enables anon access)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, HIGH RISK)

**Rotation Frequency:** 90 days (service role), 180 days (publishable)

### 2. OpenAI API Key

**Location:** Supabase Edge Functions environment variables  
**Key:** `OPENAI_API_KEY`  
**Rotation Frequency:** 90 days

### 3. Anthropic API Key

**Location:** Supabase Edge Functions environment variables  
**Key:** `ANTHROPIC_API_KEY`  
**Rotation Frequency:** 90 days

### 4. Sentry DSN

**Location:** Lovable Cloud environment variables + Edge Functions  
**Keys:** `VITE_SENTRY_DSN`, `SENTRY_DSN`  
**Rotation Frequency:** As needed (low risk, DSN is semi-public)

### 5. ElevenLabs API Key (Planned)

**Location:** Supabase Edge Functions environment variables  
**Key:** `ELEVENLABS_API_KEY`  
**Rotation Frequency:** 90 days

### 6. Replicate API Token (Planned)

**Location:** Supabase Edge Functions environment variables  
**Key:** `REPLICATE_API_TOKEN`  
**Rotation Frequency:** 90 days

## Rotation Procedures

### Supabase Publishable Key Rotation

**Estimated Time:** 15 minutes  
**Downtime:** None (overlapping validity period)

**Steps:**
1. **Generate New Key**
   - Navigate to Supabase Dashboard → Settings → API
   - Click "Generate new anon key"
   - Copy the new key

2. **Update Environment Variables**
   - Lovable Cloud: Dashboard → Settings → Environment Variables
   - Update `VITE_SUPABASE_PUBLISHABLE_KEY` with new value
   - Local development: Update `.env` file

3. **Trigger Redeploy**
   - Lovable auto-deploys on env change
   - Wait for deployment to complete (~2 minutes)

4. **Verify Functionality**
   - Navigate to `/dev/diagnostics`
   - Click "Run diagnostics"
   - Verify all API calls return 200 OK
   - Check browser console for auth errors

5. **Grace Period**
   - Wait 24 hours before revoking old key
   - Monitor Sentry for auth errors

6. **Revoke Old Key**
   - Supabase Dashboard → Settings → API
   - Revoke the old anon key
   - Confirm no active sessions using old key

**Rollback:**
- Revert `VITE_SUPABASE_PUBLISHABLE_KEY` to previous value
- Redeploy

---

### Supabase Service Role Key Rotation

**Estimated Time:** 20 minutes  
**Downtime:** ~5 minutes for edge functions

**Steps:**
1. **Generate New Key**
   - Supabase Dashboard → Settings → API
   - Generate new service role key
   - **CRITICAL:** Store securely, this key has full database access

2. **Update Edge Functions Environment**
   - Supabase Dashboard → Edge Functions → Settings → Secrets
   - Update `SUPABASE_SERVICE_ROLE_KEY` (if explicitly set)
   - Note: Supabase auto-injects this, manual update rarely needed

3. **Test Edge Functions**
   - Run: `npx supabase functions deploy ai-job-runner --no-verify-jwt`
   - Test AI job submission in `/admin/courses/ai`
   - Verify job processes correctly

4. **Monitor**
   - Check edge function logs in Supabase Dashboard → Project → Edge Functions → `ai-job-runner` → Logs  
     (The repo-pinned Supabase CLI may not include `supabase functions logs` in all versions.)
   - Watch for auth errors in first 10 minutes

5. **Revoke Old Key**
   - Wait 24 hours
   - Supabase Dashboard → Settings → API → Revoke old service role key

**Rollback:**
- Revert service role key in Supabase secrets
- Redeploy edge functions

---

### OpenAI API Key Rotation

**Estimated Time:** 10 minutes  
**Downtime:** None

**Steps:**
1. **Generate New Key**
   - https://platform.openai.com/api-keys
   - Click "Create new secret key"
   - Name it: `learnplay-prod-YYYY-MM-DD`
   - Set permissions: Read & Write (for API calls)
   - Copy key immediately (shown only once)

2. **Update Supabase Edge Functions**
   - Supabase Dashboard → Edge Functions → Settings → Secrets
   - Update `OPENAI_API_KEY`
   - Save changes

3. **Test AI Generation**
   - Navigate to `/admin/courses/ai`
   - Submit a small test job (Grade 1, 3 items per group)
   - Verify job completes successfully
   - Check `ai_course_jobs` table for status = 'done'

4. **Monitor Usage**
   - OpenAI Dashboard → Usage
   - Verify new key shows activity
   - Old key shows no new requests

5. **Revoke Old Key**
   - Wait 1 hour
   - OpenAI Dashboard → API Keys
   - Revoke old key

**Rollback:**
- Update `OPENAI_API_KEY` back to previous value
- Edge functions pick up change automatically

---

### Anthropic API Key Rotation

**Estimated Time:** 10 minutes  
**Downtime:** None (fallback to OpenAI)

**Steps:**
1. **Generate New Key**
   - https://console.anthropic.com/settings/keys
   - Click "Create Key"
   - Name it: `learnplay-prod-YYYY-MM-DD`
   - Copy key

2. **Update Supabase Edge Functions**
   - Supabase Dashboard → Edge Functions → Settings → Secrets
   - Update `ANTHROPIC_API_KEY`

3. **Test (Optional)**
   - Temporarily remove `OPENAI_API_KEY` to force Anthropic fallback
   - Test AI generation
   - Restore `OPENAI_API_KEY`

4. **Revoke Old Key**
   - Wait 1 hour
   - Anthropic Console → Keys → Delete old key

**Rollback:**
- Revert `ANTHROPIC_API_KEY` to previous value

---

### Sentry DSN Rotation

**Estimated Time:** 15 minutes  
**Downtime:** None (error tracking temporarily paused)

**Steps:**
1. **Generate New DSN**
   - Sentry Dashboard → Project Settings → Client Keys (DSN)
   - Click "Create new key"
   - Name it: `learnplay-YYYY-MM-DD`
   - Copy DSN

2. **Update Environment Variables**
   - Lovable Cloud: `VITE_SENTRY_DSN`
   - Supabase Edge Functions: `SENTRY_DSN` (if used)
   - Local `.env`: `VITE_SENTRY_DSN`

3. **Trigger Redeploy**
   - Lovable auto-deploys on env change

4. **Verify Error Capture**
   - Trigger a test error in `/dev/tests`
   - Check Sentry dashboard for new event
   - Verify correct DSN is receiving events

5. **Disable Old DSN**
   - Wait 24 hours
   - Sentry Dashboard → Client Keys → Disable old key

**Rollback:**
- Re-enable old DSN in Sentry
- Revert environment variable

---

## Emergency Rotation (Suspected Compromise)

**Trigger:** Key exposure in logs, public repo, support ticket, etc.

**Immediate Actions (Within 1 Hour):**

1. **Revoke Compromised Key Immediately**
   - Don't wait for grace period
   - Disable key in provider dashboard

2. **Generate and Deploy New Key**
   - Follow standard rotation procedure above
   - Skip grace period and testing steps if critical

3. **Force Redeploy**
   - Lovable: Push a dummy commit to trigger deploy
   - Edge Functions: `npx supabase functions deploy --all`

4. **Notify Stakeholders**
   - Email: security@yourcompany.com
   - Slack: #incidents channel
   - Log incident in security tracker

5. **Monitor for Abuse**
   - Check provider usage dashboards for unusual spikes
   - Review Sentry for auth errors
   - Check database logs for suspicious queries

6. **Post-Incident Review**
   - Document how key was exposed
   - Update procedures to prevent recurrence
   - Consider additional security controls

---

## Automation Opportunities

### Recommended: Rotate-on-Schedule Script

```bash
#!/bin/bash
# rotate-secrets.sh - Run every 90 days via cron

echo "Starting scheduled secrets rotation..."

# 1. Generate new OpenAI key (requires API access or manual step)
echo "→ Rotate OpenAI key (manual: https://platform.openai.com/api-keys)"

# 2. Update Supabase secrets
echo "→ Update Supabase Edge Functions secrets"
# npx supabase secrets set OPENAI_API_KEY=new-key

# 3. Verify deployment
echo "→ Verify edge functions still work"
# npm run e2e:live -- tests/e2e/ai-author-live.spec.ts

echo "Rotation complete. Monitor for 24 hours before revoking old keys."
```

### Future: Automated Rotation with Vault

- Integrate HashiCorp Vault or AWS Secrets Manager
- Auto-rotate keys every 30 days
- Zero-downtime rotation with dynamic secrets

---

## Monitoring and Alerts

### Sentry Alerts

- **Auth Errors Spike:** >10 401/403 errors in 5 minutes → Likely bad key
- **Edge Function Errors:** >5 failures in 1 minute → Check AI provider keys

### OpenAI/Anthropic Alerts

- **Usage Spike:** >$10/hour → Possible key abuse
- **Rate Limit Errors:** Indicates compromised key or misconfiguration

### Supabase Alerts

- **RLS Policy Violations:** Indicates potential service role key misuse

---

## Checklist: Quarterly Rotation

Use this checklist every 90 days:

- [ ] Rotate OpenAI API key
- [ ] Rotate Anthropic API key
- [ ] Rotate ElevenLabs API key (when implemented)
- [ ] Rotate Replicate API token (when implemented)
- [ ] Rotate Supabase publishable key (every 180 days)
- [ ] Test all AI generation flows
- [ ] Verify diagnostics page shows green status
- [ ] Update this document with lessons learned

---

## Contacts

- **Security Incidents:** security@yourcompany.com
- **On-Call Engineer:** [PagerDuty rotation]
- **Supabase Support:** https://supabase.com/support
- **OpenAI Support:** https://help.openai.com

---

## References

- [Supabase API Keys Documentation](https://supabase.com/docs/guides/api/api-keys)
- [OpenAI API Key Best Practices](https://platform.openai.com/docs/guides/production-best-practices/api-keys)
- [docs/ENVIRONMENT_CONFIG.md](./ENVIRONMENT_CONFIG.md) - Environment variable guide

