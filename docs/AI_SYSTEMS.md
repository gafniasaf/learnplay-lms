# AI Systems Documentation

**Last Updated:** 2025-11-13  
**Status:** Implemented

---

## Overview

The LearnPlay platform includes three integrated AI systems for course generation, quality assurance, and operational monitoring:

1. **AI Course Generation** - Automated course creation with OpenAI/Anthropic
2. **AI Course Reviews** - Quality assurance and content validation
3. **AI Telemetry** - Performance monitoring and cost tracking

---

## 1. AI Course Generation

### Architecture

**Job Queue System:**
- Asynchronous processing via Supabase Edge Functions
- Real-time progress tracking with status updates
- Support for multiple AI providers (OpenAI, Anthropic)

**Key Components:**
- `generate-course` edge function - Initiates course generation job
- `ai-job-runner` edge function - Processes queued jobs
- `ai_course_jobs` table - Job queue and status tracking

### Database Schema

```sql
CREATE TABLE ai_course_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,              -- 'pending', 'running', 'completed', 'failed'
  provider TEXT NOT NULL,             -- 'openai', 'anthropic'
  model TEXT NOT NULL,                -- Model identifier
  prompt JSONB NOT NULL,              -- Generation parameters
  result JSONB,                       -- Generated course data
  error TEXT,                         -- Error message if failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID                     -- User who initiated
);
```

### API Usage

**Start Generation:**
```typescript
const job = await supabase.functions.invoke('generate-course', {
  body: {
    topic: 'Algebra Basics',
    difficulty: 'beginner',
    itemCount: 20,
    provider: 'openai',  // or 'anthropic'
    model: 'gpt-4'
  }
});

// Returns: { jobId: string, status: 'pending' }
```

**Check Status:**
```typescript
const { data } = await supabase
  .from('ai_course_jobs')
  .select('*')
  .eq('id', jobId)
  .single();

// Statuses: 'pending' | 'running' | 'completed' | 'failed'
```

**Real-time Updates:**
```typescript
const subscription = supabase
  .channel(`job:${jobId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'ai_course_jobs',
    filter: `id=eq.${jobId}`
  }, (payload) => {
    console.log('Job status:', payload.new.status);
  })
  .subscribe();
```

### Provider Configuration

**OpenAI:**
- Models: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`
- Cost: ~$0.03-0.06 per course (20 items)
- Speed: 30-60 seconds

**Anthropic (Claude):**
- Models: `claude-3-5-sonnet-20241022`, `claude-3-opus`
- Cost: ~$0.04-0.08 per course
- Speed: 40-70 seconds

**Environment Variables:**
```env
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

---

## 2. AI Course Reviews

### Purpose

Quality assurance system for AI-generated courses. Validates content accuracy, difficulty appropriateness, and pedagogical quality.

### Database Schema

```sql
CREATE TABLE ai_course_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  job_id UUID REFERENCES ai_course_jobs(id),
  reviewer_type TEXT NOT NULL,        -- 'human', 'ai', 'automated'
  reviewer_id UUID,                   -- User ID if human
  
  -- Review scores (0-1 scale)
  accuracy_score NUMERIC,
  difficulty_score NUMERIC,
  pedagogical_score NUMERIC,
  overall_score NUMERIC,
  
  -- Detailed feedback
  feedback JSONB,                     -- Structured comments
  issues JSONB,                       -- Array of identified issues
  suggestions JSONB,                  -- Improvement recommendations
  
  -- Actions
  status TEXT NOT NULL,               -- 'approved', 'rejected', 'needs_revision'
  revised_course_id TEXT,             -- If revised
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Review Types

#### 1. Automated Reviews
Run immediately after generation, check:
- JSON schema validity
- Required field completeness
- Answer key correctness
- Difficulty consistency

#### 2. AI Reviews
LLM-powered content validation:
- Factual accuracy
- Grammar and clarity
- Age-appropriateness
- Cultural sensitivity

#### 3. Human Reviews
Expert educator review:
- Pedagogical effectiveness
- Curriculum alignment
- Student engagement potential
- Final approval

### API Usage

**Submit for Review:**
```typescript
const review = await supabase
  .from('ai_course_reviews')
  .insert({
    course_id: 'course-123',
    job_id: jobId,
    reviewer_type: 'automated',
    accuracy_score: 0.95,
    difficulty_score: 0.88,
    pedagogical_score: 0.92,
    overall_score: 0.92,
    feedback: {
      strengths: ['Clear explanations', 'Good variety'],
      weaknesses: ['Needs more examples']
    },
    status: 'approved'
  });
```

**Query Review History:**
```typescript
const { data: reviews } = await supabase
  .from('ai_course_reviews')
  .select('*')
  .eq('course_id', courseId)
  .order('created_at', { ascending: false });
```

### Review Workflow

```
Generate Course
    ↓
Automated Review (< 5 sec)
    ↓
┌─ PASS → AI Review (30 sec) → PASS → Human Review (optional) → Publish
└─ FAIL → Flag for Revision
```

---

## 3. AI Telemetry

### Purpose

Operational monitoring and cost tracking for AI systems. Provides visibility into:
- Token usage and costs
- API performance and latency
- Error rates and patterns
- Provider comparison metrics

### Database Schema

```sql
CREATE TABLE ai_course_jobs_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ai_course_jobs(id),
  
  -- Performance metrics
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  
  -- Cost tracking
  estimated_cost NUMERIC(10, 6),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Request metadata
  request_id TEXT,
  rate_limit_remaining INTEGER,
  rate_limit_reset TIMESTAMPTZ,
  
  -- Errors and retries
  errors JSONB,                       -- Array of error events
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Metrics Tracked

#### Token Usage
```typescript
{
  total_tokens: 1523,
  prompt_tokens: 412,
  completion_tokens: 1111,
  estimated_cost: 0.0456  // USD
}
```

#### Performance
```typescript
{
  latency_ms: 34521,  // 34.5 seconds
  rate_limit_remaining: 198,
  retry_count: 0
}
```

#### Errors
```typescript
{
  errors: [
    {
      timestamp: '2025-01-10T14:23:15Z',
      error_code: 'rate_limit_exceeded',
      message: 'Rate limit reached, retrying in 20s',
      retry_after: 20
    }
  ]
}
```

### Monitoring Queries

**Daily Cost Summary:**
```sql
SELECT 
  DATE(created_at) as date,
  provider,
  COUNT(*) as jobs,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost) as total_cost
FROM ai_course_jobs_telemetry
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), provider
ORDER BY date DESC;
```

**Average Latency by Provider:**
```sql
SELECT 
  provider,
  model,
  AVG(latency_ms) as avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as median_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms
FROM ai_course_jobs_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY provider, model;
```

**Error Rate:**
```sql
SELECT 
  provider,
  COUNT(*) FILTER (WHERE errors IS NOT NULL) as error_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE errors IS NOT NULL) / COUNT(*), 2) as error_rate_pct
FROM ai_course_jobs_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY provider;
```

### Cost Estimation

**OpenAI Pricing (as of 2025):**
- GPT-4: $0.03 per 1K prompt tokens, $0.06 per 1K completion tokens
- GPT-3.5-Turbo: $0.0015 per 1K prompt tokens, $0.002 per 1K completion tokens

**Anthropic Pricing:**
- Claude 3.5 Sonnet: $0.003 per 1K input tokens, $0.015 per 1K output tokens
- Claude 3 Opus: $0.015 per 1K input tokens, $0.075 per 1K output tokens

**Typical Course Generation:**
- Prompt tokens: ~400-500
- Completion tokens: ~1000-1500
- Total cost: $0.03-0.08 per course

---

## Integration with Course Editor

### Generation Flow

1. **User initiates generation** in Course Studio
2. **Frontend calls** `generate-course` edge function
3. **Job queued** in `ai_course_jobs` table
4. **Worker picks up** job via `ai-job-runner`
5. **Real-time updates** via Supabase Realtime
6. **Telemetry logged** to `ai_course_jobs_telemetry`
7. **Automated review** runs on completion
8. **Course ready** for editing/publishing

### UI Components

**Generation Status:**
```typescript
// src/components/admin/AIGenerationStatus.tsx
<JobStatus 
  jobId={jobId}
  onComplete={(course) => navigate(`/admin/courses/${course.id}`)}
  onError={(error) => showToast(error.message)}
/>
```

**Cost Estimation:**
```typescript
// Show estimated cost before generation
const estimate = calculateCost({
  provider: 'openai',
  model: 'gpt-4',
  itemCount: 20
});

console.log(`Estimated cost: $${estimate.toFixed(4)}`);
```

---

## Administrative Tools

### Job Queue Management

**View Active Jobs:**
```sql
SELECT 
  id,
  status,
  provider,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM ai_course_jobs
WHERE status IN ('pending', 'running')
ORDER BY created_at;
```

**Retry Failed Jobs:**
```sql
UPDATE ai_course_jobs
SET 
  status = 'pending',
  error = NULL,
  started_at = NULL
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour';
```

**Clean Old Jobs:**
```sql
-- Archive jobs older than 90 days
DELETE FROM ai_course_jobs
WHERE status = 'completed'
  AND completed_at < NOW() - INTERVAL '90 days';
```

### Cost Controls

**Daily Budget Alert:**
```sql
SELECT 
  DATE(created_at) as date,
  SUM(estimated_cost) as daily_cost
FROM ai_course_jobs_telemetry
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY DATE(created_at)
HAVING SUM(estimated_cost) > 100.00;  -- Alert if > $100/day
```

**Rate Limiting:**
- Configure per-user daily limits
- Enforce organization-wide quotas
- Throttle generation during peak hours

---

## Monitoring & Alerts

### Recommended Alerts

1. **High Error Rate** - >5% failures in 1 hour
2. **Cost Spike** - >$50/hour unexpected increase
3. **Slow Jobs** - >2 minutes for standard course
4. **Queue Backlog** - >20 pending jobs
5. **Provider Outage** - All jobs failing for single provider

### Grafana Dashboard Queries

**Job Throughput:**
```sql
SELECT 
  date_trunc('hour', completed_at) as hour,
  COUNT(*) as completed_jobs
FROM ai_course_jobs
WHERE completed_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

**Cost Over Time:**
```sql
SELECT 
  date_trunc('day', created_at) as day,
  SUM(estimated_cost) as cost
FROM ai_course_jobs_telemetry
GROUP BY day
ORDER BY day;
```

---

## Best Practices

### 1. Provider Selection
- Use OpenAI GPT-4 for complex educational content
- Use GPT-3.5-Turbo for simple factual courses
- Use Anthropic Claude for long-form content
- Implement fallback to secondary provider

### 2. Cost Optimization
- Cache common course templates
- Batch similar generation requests
- Use cheaper models for drafts
- Implement user quotas

### 3. Quality Assurance
- Always run automated review
- Require human review for public courses
- Track review metrics over time
- Implement feedback loop to improve prompts

### 4. Error Handling
- Implement exponential backoff retries
- Log detailed error context
- Alert on sustained failures
- Provide clear user feedback

---

## Future Enhancements

### Planned Features
- Multi-modal generation (images, audio, video)
- Incremental generation with user feedback
- Fine-tuned models for specific subjects
- Collaborative human-AI editing
- A/B testing of different prompts
- Automatic prompt optimization

### Analytics Roadmap
- Predictive cost modeling
- Quality score trending
- User satisfaction correlation
- Cross-provider performance comparison

---

## References

- **Migrations:**
  - `supabase/migrations/20251113000000_add_ai_course_jobs_telemetry.sql`
  - `supabase/migrations/20251113000001_add_ai_course_reviews.sql`
  - `supabase/migrations/20251113094500_add_ai_course_jobs_summary.sql`

- **Edge Functions:**
  - `supabase/functions/generate-course/`
  - `supabase/functions/ai-job-runner/`
  - `supabase/functions/ai-media-runner/`

- **Documentation:**
  - [AI Providers & Governance](AI_PROVIDERS.md)
  - [Job Queue Operations](JOB_QUEUE_OPERATIONS.md)
  - [Post-Generation Editing](POST_GENERATION_EDITING.md)

---

**Last Updated:** 2025-11-13  
**Maintainer:** Platform Team  
**Status:** Production (all systems operational)
