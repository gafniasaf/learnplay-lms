# AI Providers and Telemetry

## Overview

The LearnPlay Platform supports multiple AI providers for course generation and media generation, with automatic fallback, telemetry tracking, PII redaction, governance controls, and cost management.

---

## **Text Generation Providers** (Course Content)

### 1. OpenAI (Primary)
- **Model:** `gpt-4-turbo-2024-04-09`
- **Use Case:** Course generation, item regeneration
- **Pricing:** ~$10/1M input tokens, ~$30/1M output tokens
- **Configuration:** `OPENAI_API_KEY` environment variable

### 2. Anthropic Claude (Fallback)
- **Model:** `claude-3-5-sonnet-20241022` (configurable via `ANTHROPIC_MODEL`)
- **Use Case:** Fallback when OpenAI unavailable or rate-limited
- **Pricing:** ~$3/1M input tokens, ~$15/1M output tokens
- **Configuration:** `ANTHROPIC_API_KEY` environment variable

---

## **Media Generation Providers** (Images, Audio, Video)

### Image Providers

| Provider | Model | Quality | Cost/Generation | Avg Time | Status |
|----------|-------|---------|----------------|----------|--------|
| **DALL-E 3** | `dall-e-3` | ★★★★★ | $0.04 | 45s | ✅ Enabled |
| **DALL-E 3 HD** | `dall-e-3` (HD) | ★★★★★ | $0.08 | 50s | ✅ Enabled |
| **Stable Diffusion XL** | `sdxl` | ★★★★☆ | $0.01 | 15s | ⚠️ Disabled (needs REPLICATE_API_TOKEN) |

**Configuration**:
- `OPENAI_API_KEY` - For DALL-E 3
- `REPLICATE_API_TOKEN` - For Stable Diffusion

### Audio Providers

| Provider | Model | Quality | Cost/1K chars | Avg Time | Status |
|----------|-------|---------|--------------|----------|--------|
| **OpenAI TTS** | `tts-1` | ★★★★★ | $0.015 | 20s | ✅ Enabled |
| **OpenAI TTS HD** | `tts-1-hd` | ★★★★★ | $0.030 | 25s | ✅ Enabled |
| **ElevenLabs** | `eleven_monolingual_v1` | ★★★★★ | $0.030 | 15s | ⚠️ Disabled (needs ELEVENLABS_API_KEY) |

**Configuration**:
- `OPENAI_API_KEY` - For OpenAI TTS
- `ELEVENLABS_API_KEY` - For ElevenLabs

### Video Providers

| Provider | Model | Quality | Cost/Generation | Avg Time | Status |
|----------|-------|---------|----------------|----------|--------|
| **Zeroscope** | `zeroscope-v2-xl` | ★★★☆☆ | $0.25 | 180s | ⚠️ Disabled (needs REPLICATE_API_TOKEN) |

**Configuration**:
- `REPLICATE_API_TOKEN` - For video generation

---

## **Provider Governance**

### Enabling/Disabling Providers

Providers can be enabled/disabled at runtime via the `media_generation_providers` table:

```sql
-- Disable Stable Diffusion
update public.media_generation_providers
set enabled = false
where id = 'replicate-sdxl';

-- Enable Stable Diffusion
update public.media_generation_providers
set enabled = true
where id = 'replicate-sdxl';
```

### Admin UI

Admins can manage providers via `/admin/providers` (planned):
- Enable/disable providers
- View usage statistics
- Set cost caps
- Configure default providers per media type

---

## **Cost Management**

### Per-User Budget Caps

```sql
-- Add budget cap for user
insert into public.user_budgets (user_id, daily_cap_usd, monthly_cap_usd) values
  ('user-uuid', 5.00, 50.00);
```

### Per-Course Budget Caps

```sql
-- Add budget cap for course generation
insert into public.course_generation_budgets (course_id, max_cost_usd) values
  ('course-uuid', 10.00);
```

### Budget Enforcement

1. Before generating media, check user's spend today/month
2. If over cap, reject with error: "Budget exceeded"
3. Show warning at 80% of budget
4. Admins can override caps

### Cost Tracking

All costs are tracked in `media_assets` table:

```sql
select 
  created_by,
  sum(cost_usd) as total_spent,
  count(*) as assets_generated
from public.media_assets
where created_at > current_date - interval '30 days'
group by created_by
order by total_spent desc;
```

---

## **Quotas and Rate Limits**

### Provider-Level Limits

| Provider | Rate Limit | Burst | Daily Cap |
|----------|-----------|-------|-----------|
| OpenAI DALL-E 3 | 5 req/min | 10 | 500 |
| OpenAI TTS | 50 req/min | 100 | 5000 |
| Replicate | 100 req/hr | 200 | 1000 |

### Application-Level Limits

- **Per User**: 50 media generations/day
- **Per Course**: 100 media assets total
- **Per Job**: 5 retry attempts max

---

## **Provider Selection Strategy**

### Image Generation

**Recommendation**: DALL-E 3 for educational content (precision, accuracy)

**Cost-Optimized**: Stable Diffusion XL for high-volume prototyping

**HD Quality**: DALL-E 3 HD for final production

### Audio Generation

**Recommendation**: OpenAI TTS (best balance of quality, cost, speed)

**Premium**: ElevenLabs for voice cloning or custom voices

### Video Generation

**Early Access**: Zeroscope (low quality, but functional)

**Future**: Runway, Sora (when available)

---

## **Telemetry and Observability**

### Provider Usage Logs

Every generation logs:
```json
{
  "type": "provider_usage",
  "provider": "openai-dalle3",
  "success": true,
  "generation_time_ms": 12543,
  "cost_usd": 0.04,
  "timestamp": "2025-10-24T12:00:00Z"
}
```

### Metrics Tracked

- **Success Rate**: % of successful generations
- **Avg Generation Time**: ms per provider
- **Cost per Generation**: USD per asset
- **Failure Reasons**: errors grouped by type
- **User Spend**: daily/monthly per user

### Dashboards

- **/admin/analytics** - Provider performance metrics
- **/admin/costs** - Cost breakdown by provider, user, course

---

## **Moderation**

### Provider-Level Moderation

OpenAI DALL-E 3 returns moderation flags:
```json
{
  "violence": false,
  "sexual": false,
  "hate": false,
  "self-harm": false
}
```

Flagged assets:
- Marked `moderation_status = 'pending'` in `media_assets`
- Still uploaded (URL accessible)
- Require admin review before use in courses

### Manual Review Workflow

1. Admin navigates to `/admin/moderation`
2. Views pending assets
3. Approves or rejects
4. Rejected assets marked `status = 'quarantined'`
5. Courses referencing quarantined assets show placeholder

---

## **PII Redaction**

See existing PII redaction logic in `ai-providers.ts` (text generation).

For media prompts, redact before sending to provider:

```typescript
const redactedPrompt = redactPII(prompt);
// Store both original and redacted in media_assets
```

---

## **Provider Comparison Tool**

AI can recommend best provider for a given task:

```typescript
import { compareProviders } from '../_shared/media-providers.ts';

const recommendations = compareProviders('image', {
  mediaType: 'image',
  prompt: 'Detailed liver anatomy',
}, 'best');

console.log(recommendations[0]);
/*
{
  provider: { id: 'openai-dalle3', name: 'DALL-E 3', ... },
  cost: 0.04,
  time: 45,
  quality: 5,
  reasoning: 'Highest quality for medical diagrams'
}
*/
```

---

## **Future Providers (Roadmap)**

### Image
- Midjourney (via API when available)
- Adobe Firefly
- Ideogram

### Audio
- Google Cloud TTS
- Amazon Polly
- Murf.ai

### Video
- Runway Gen-2
- OpenAI Sora (when released)
- Pika Labs

---

**Last Updated:** 2025-10-24  
**Version:** 2.0  
**Status:** Active

## Provider Selection

### Priority Order

Set via `AI_PROVIDER_PRIORITY` environment variable (default: `openai,anthropic`):

```env
# Try OpenAI first, fallback to Anthropic
AI_PROVIDER_PRIORITY=openai,anthropic

# Or reverse priority
AI_PROVIDER_PRIORITY=anthropic,openai

# Single provider only
AI_PROVIDER_PRIORITY=anthropic
```

### Fallback Logic

1. Check `AI_PROVIDER_PRIORITY` for order
2. For each provider in order:
   - Verify API key exists
   - Attempt generation
   - On success: return result, record telemetry
   - On failure: try next provider
3. If all providers fail: mark job as failed

### Implementation

See `supabase/functions/_shared/ai-providers.ts`:
- `getAvailableProviders()` - Returns ordered list of configured providers
- `estimateCost()` - Calculates cost based on token usage
- `recordProviderTelemetry()` - Logs performance metrics to database

## Telemetry Tracking

### Metrics Collected

For each AI API call, we record:
- **Provider:** `openai` | `anthropic`
- **Latency:** Request duration in milliseconds
- **Success:** Boolean success indicator
- **Error Type:** Category of error if failed
- **Tokens Used:** Input + output token count
- **Estimated Cost:** Cost in USD based on provider pricing

### Database Schema

```sql
create table public.ai_provider_telemetry (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ai_course_jobs(id),
  provider text not null,
  latency_ms integer not null,
  success boolean not null,
  error_type text,
  tokens_used integer,
  estimated_cost numeric(10, 6),
  recorded_at timestamptz not null default now()
);
```

### Querying Telemetry

**Average latency by provider:**
```sql
select provider, avg(latency_ms) as avg_latency_ms
from ai_provider_telemetry
where recorded_at > now() - interval '7 days'
group by provider;
```

**Error rates:**
```sql
select 
  provider,
  count(*) as total,
  sum(case when success then 1 else 0 end) as successes,
  sum(case when not success then 1 else 0 end) as failures,
  round(100.0 * sum(case when not success then 1 else 0 end) / count(*), 2) as error_rate_pct
from ai_provider_telemetry
where recorded_at > now() - interval '7 days'
group by provider;
```

**Cost tracking:**
```sql
select 
  provider,
  sum(estimated_cost) as total_cost_usd,
  avg(estimated_cost) as avg_cost_per_call
from ai_provider_telemetry
where recorded_at > now() - interval '30 days'
  and success = true
group by provider;
```

## PII Redaction

All user-provided prompts and AI responses are redacted before logging to prevent PII exposure.

### Redaction Rules

Implemented in `supabase/functions/_shared/ai-providers.ts`:

- **Email addresses:** `john@example.com` → `[EMAIL]`
- **Phone numbers:** `555-123-4567` → `[PHONE]`
- **Credit cards:** `1234-5678-9012-3456` → `[CARD]`
- **SSN:** `123-45-6789` → `[SSN]`

### Usage

```typescript
import { redactPII } from '../_shared/ai-providers.ts';

const userPrompt = "Generate a course for john@school.edu, phone 555-1234";
const redacted = redactPII(userPrompt);
// Result: "Generate a course for [EMAIL], phone [PHONE]"

console.log("[generate-course] Prompt:", redacted);
```

## Monitoring and Alerts

### Recommended Alerts

**High Error Rate:**
- Trigger: >20% error rate for any provider in 1 hour
- Action: Check provider status page, verify API keys, review recent changes

**High Latency:**
- Trigger: Avg latency >60s for any provider in 15 minutes
- Action: Check provider service status, consider switching priority

**Cost Spike:**
- Trigger: >$50/day spend on any provider
- Action: Review job queue for unusual activity, check for abuse

**Fallback Usage:**
- Trigger: >80% of requests using fallback provider
- Action: Primary provider may be down or rate-limited

### Sentry Integration

Provider errors are automatically sent to Sentry with:
- **Tag:** `ai_provider` (openai, anthropic)
- **Tag:** `error_type` (rate_limit, timeout, invalid_response, etc.)
- **Extra:** Latency, tokens used, cost estimate

## Provider Comparison

| Feature | OpenAI GPT-4 Turbo | Anthropic Claude 3.5 |
|---------|-------------------|---------------------|
| **Quality** | Excellent | Excellent |
| **Speed** | ~30-45s per course | ~25-40s per course |
| **Cost** | Higher ($10-30/1M) | Lower ($3-15/1M) |
| **Rate Limits** | 500 RPM (Tier 1) | 50 RPM (free tier) |
| **Context Window** | 128K tokens | 200K tokens |
| **Best For** | Complex reasoning, strict schema | Longer courses, cost efficiency |

## Best Practices

1. **Always configure both providers** for redundancy
2. **Monitor telemetry daily** to detect issues early
3. **Set spending limits** in provider dashboards
4. **Rotate API keys** every 90 days (see [SECRETS_ROTATION.md](./SECRETS_ROTATION.md))
5. **Review error logs** weekly for patterns
6. **Test fallback** regularly to ensure it works

## Troubleshooting

### Provider unavailable

**Symptom:** "No AI provider configured" error

**Solution:**
1. Verify `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in Supabase Edge Functions settings
2. Check provider API key is valid (test in their web UI)
3. Verify key has correct permissions (read & write for API calls)

### High error rate

**Symptom:** >20% of jobs failing with provider errors

**Possible Causes:**
- Rate limiting (reduce job submission rate)
- Invalid API key (rotate key)
- Provider outage (check status page)
- Model deprecated (update model name)

**Solution:**
1. Check telemetry for error types
2. Review provider status pages
3. Switch `AI_PROVIDER_PRIORITY` to working provider
4. Contact provider support if persistent

### Fallback not working

**Symptom:** Jobs fail instead of trying fallback provider

**Solution:**
1. Verify `ANTHROPIC_API_KEY` is set
2. Check `AI_PROVIDER_PRIORITY` includes both providers
3. Review edge function logs for fallback attempts
4. Test Anthropic key directly via cURL

## Future Enhancements

- [ ] Add more providers (Google Gemini, Cohere)
- [ ] Implement provider health checks
- [ ] Auto-adjust priority based on latency/error rates
- [ ] Cost budget enforcement per user/org
- [ ] A/B testing for provider quality comparison

## References

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference)
- [supabase/functions/_shared/ai-providers.ts](../../supabase/functions/_shared/ai-providers.ts)
- [supabase/functions/generate-course/index.ts](../../supabase/functions/generate-course/index.ts)

