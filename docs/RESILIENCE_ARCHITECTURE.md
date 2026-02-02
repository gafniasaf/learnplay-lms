# Resilience Architecture

This document describes the fault-tolerance and self-healing mechanisms built into the system.

## Overview

The system implements multiple layers of resilience to handle LLM failures, stalled jobs, and service outages gracefully.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Request Flow                                  │
├─────────────────────────────────────────────────────────────────────┤
│  User Request → Edge Function → LLM (Primary)                       │
│                                    ↓ (on failure)                   │
│                               LLM (Fallback)                        │
│                                    ↓ (on failure)                   │
│                               Rescue Mode                           │
└─────────────────────────────────────────────────────────────────────┘
```

## 1. AI Provider Fallback & Circuit Breaker

### Configuration
```
AI_PROVIDER_FALLBACKS=openai        # Fallback providers (comma-separated)
AI_CIRCUIT_BREAKER_FAILURES=3       # Failures before circuit trips
AI_CIRCUIT_BREAKER_RESET_MS=300000  # 5 minutes to reset circuit
```

### How It Works

1. **Primary Provider**: System tries Anthropic (Claude) first
2. **Fallback Chain**: On failure, tries each fallback provider in order
3. **Circuit Breaker**: After 3 consecutive failures, provider is skipped for 5 minutes
4. **Auto-Recovery**: Circuit automatically resets after the cooldown period

### Code Location
- `supabase/functions/_shared/ai.ts`
- `queue-pump/src/ai.ts`

## 2. LLM-Based Rescue (No Deterministic Fallbacks)

### Philosophy
Instead of hardcoded fallback content, the system uses LLM-based rescue with:
- Minimal schemas
- Low temperature (0.2)
- Multi-step repair attempts

### Rescue Functions
| Function | Purpose |
|----------|---------|
| `rescueLessonPlan()` | Generates emergency lesson plan via LLM |
| `rescueMultiWeekOverview()` | Generates multi-week overview via LLM |
| `rescueWeekPlan()` | Generates weekly plan via LLM |

### Quality Flags
Rescued content includes quality flags:
- `rescue_prompt`: Content was generated via rescue path
- `json_repair`: JSON was repaired by LLM

### Code Location
- `supabase/functions/_shared/teacher-utils.ts`

## 3. Job Reconciler (Self-Healing Queue)

### What It Does
Automatically detects and recovers stalled/stuck jobs:
- Marks stalled `processing` jobs as `failed`
- Allows retry with exponential backoff
- Dead-letters jobs after max retries

### Stale Thresholds
| Job Type | Stale After |
|----------|-------------|
| Course Jobs | 5 minutes |
| Agent Jobs | 15 minutes |

### Retry Logic
- Base backoff: 30 seconds
- Max backoff: 10 minutes
- Max retries: 3 (then → dead_letter)

### Cron Schedule
Runs every minute via `pg_cron`:
```sql
-- jobs-reconciler-every-minute
* * * * *
```

### Code Location
- `supabase/functions/jobs-reconciler/index.ts`
- Migration: `20260131134000_jobs_reconciler_cron.sql`

## 4. Alert Detection & Notification

### What It Monitors
| Alert Type | Trigger |
|------------|---------|
| `stuck_agent_jobs` | Jobs in `processing` > 15 min |
| `stuck_course_jobs` | Jobs in `processing` > 5 min |
| `dead_letter_spike` | Dead letters ≥ 2 in window |
| `failure_rate_spike` | Failure rate ≥ 30% |

### Severity Levels
- **Critical**: Failure rate > 60%, stuck jobs > 3, dead letters > 5
- **Warning**: Lower thresholds
- **Info**: Informational only

### Cron Schedule
Runs every 5 minutes via `pg_cron`:
```sql
-- alert-detector-every-5min
*/5 * * * *
```

### Slack Integration
Critical alerts are automatically posted to Slack when `SLACK_WEBHOOK_URL` is configured.

### Code Location
- `supabase/functions/alert-detector/index.ts`
- `supabase/functions/list-alerts/index.ts`
- `supabase/functions/slack-notify/index.ts`
- Migration: `20260131150000_alert_detector_cron.sql`

## 5. Book Section Generation Rescue

### Rescue Mode
After 4 draft attempts fail, book section generation enters rescue mode:
1. Relaxes constraints (sparse layout, low microheading density)
2. Reduces token limit by 30%
3. Allows 2 rescue attempts before failing

### Code Location
- `queue-pump/src/strategies/book_generate_section.ts`
- `supabase/functions/ai-job-runner/strategies/book_generate_section.ts`

## 6. Database Schema

### Key Tables
```sql
-- Job tracking with resilience columns
ai_agent_jobs (
  status,           -- queued/processing/done/failed/dead_letter
  retry_count,      -- Current retry attempt
  max_retries,      -- Max allowed retries (default: 3)
  next_attempt_at,  -- Scheduled retry time
  last_heartbeat,   -- Last activity timestamp
  error             -- Error message if failed
)

-- Alert storage
alerts (
  type,             -- Alert type (stuck_jobs, failure_rate, etc.)
  severity,         -- info/warning/critical
  alert_key,        -- Unique key for deduplication
  count,            -- Occurrence count
  resolved_at       -- NULL if active
)
```

## 7. Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AI_PROVIDER_FALLBACKS` | Fallback LLM providers | - |
| `AI_CIRCUIT_BREAKER_FAILURES` | Failures before trip | 3 |
| `AI_CIRCUIT_BREAKER_RESET_MS` | Circuit reset time | 300000 |
| `AGENT_JOB_RETRY_BASE_MS` | Base retry delay | 30000 |
| `AGENT_JOB_RETRY_MAX_MS` | Max retry delay | 600000 |
| `SLACK_WEBHOOK_URL` | Slack notifications | - |

## 8. Testing

### Soak Test
Run fault injection test to validate reconciler:
```bash
npm run soak:jobs
```

This test:
1. Creates artificially-staled jobs
2. Triggers the reconciler
3. Verifies jobs transition to failed/dead_letter

## 9. Dashboard

The Jobs Dashboard (`/admin/jobs`) shows:
- Active jobs by type and status
- Alerts tab with severity indicators
- Manual reconciler trigger

## 10. Recovery Playbook

### High Failure Rate
1. Check `alerts` table for `failure_rate_spike`
2. Review `ai_agent_jobs` errors
3. Check LLM provider status
4. Verify `AI_PROVIDER_FALLBACKS` is configured

### Stuck Jobs
1. Check `alerts` table for `stuck_*_jobs`
2. Manually trigger reconciler: POST `/functions/v1/jobs-reconciler`
3. Review job logs for stuck job IDs

### Circuit Breaker Tripped
1. Wait for auto-reset (5 minutes)
2. Or restart Edge Functions to reset state
3. Check provider API status

---

*Last updated: January 2026*
