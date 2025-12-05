# Analytics Event Logging & Nightly Exports

## Overview

This system provides a durable, append-only analytics pipeline for student event logging with automatic nightly exports to Storage.

## Architecture

### Event Logging

**Edge Function:** `log-event`
- Accepts batches of events (up to 100 per request)
- Validates events using Zod schemas
- Idempotent by `(session_id, idempotency_key)`
- Returns 200 with counts of inserted and duplicate events

**Frontend Queue:**
- Batches events (50 per flush, 5-second interval)
- Persists to localStorage for offline support
- Auto-retries on reconnection
- Flushes on page unload

### Nightly Exports

**Edge Function:** `export-analytics`
- Queries events for a specific date
- Exports to NDJSON format (newline-delimited JSON)
- Uploads to `analytics/YYYY/MM/DD/events-<timestamp>.ndjson`
- Requires admin/service role authentication

## Database Schema

```sql
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, idempotency_key)
);
```

## Usage

### Log Events from Frontend

```typescript
import { logEvent, flushEvents } from '@/lib/api';

// Log an event (queues automatically)
logEvent(sessionId, 'game_started', { 
  courseId: 'modals',
  level: 1 
});

// Manually flush queue (optional)
await flushEvents();
```

### Setting Up Nightly Cron Job

To enable automatic nightly exports, set up a cron job in Supabase:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule nightly export at 2 AM UTC
SELECT cron.schedule(
  'export-analytics-nightly',
  '0 2 * * *', -- At 2:00 AM every day
  $$
  SELECT
    net.http_post(
      url:='https://grffepyrmjihphldyfha.supabase.co/functions/v1/export-analytics',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Verify the job is scheduled
SELECT * FROM cron.job;

-- View job execution history
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

**Important:** Replace `YOUR_SERVICE_ROLE_KEY` with your actual Supabase service role key from the project settings.

### Manual Export

To manually trigger an export for a specific date:

```bash
curl -X POST https://grffepyrmjihphldyfha.supabase.co/functions/v1/export-analytics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -d '{"date": "2025-10-18"}'
```

## Storage Structure

```
analytics/
├── 2025/
│   ├── 10/
│   │   ├── 18/
│   │   │   ├── events-2025-10-18T02-00-00.ndjson
│   │   │   └── events-2025-10-18T14-30-00.ndjson (manual)
│   │   └── 19/
│   │       └── events-2025-10-19T02-00-00.ndjson
```

## Event Types

Common event types:
- `game_started` - User starts a game session
- `game_completed` - User completes a game round
- `level_up` - User advances to next level
- `answer_correct` - Correct answer given
- `answer_wrong` - Wrong answer given
- `hint_used` - User requests a hint
- `tts_played` - Text-to-speech played

## Data Format (NDJSON)

Each line is a complete JSON object:

```json
{"id":"uuid","session_id":"uuid","idempotency_key":"key","event_type":"game_started","event_data":{"courseId":"modals"},"user_id":"uuid","created_at":"2025-10-19T14:37:00Z"}
{"id":"uuid","session_id":"uuid","idempotency_key":"key","event_type":"answer_correct","event_data":{"itemId":5},"user_id":"uuid","created_at":"2025-10-19T14:37:05Z"}
```

## RLS Policies

- Users can insert their own events
- Users can read their own events
- Teachers/admins can read events from students in their organization
- Only admins can read analytics exports from Storage

## Testing

Run the event logging test:

```typescript
// In /dev/tests page
import { runEventLoggingTest } from '@/lib/tests/edgeSmoke.test';

const result = await runEventLoggingTest();
console.log(result);
```

## Performance

- **Event insertion:** ~50ms per batch (up to 100 events)
- **Export query:** ~2-5 seconds for 10k events
- **Export upload:** ~1-2 seconds per file
- **Storage size:** ~1KB per 10 events (NDJSON)

## Troubleshooting

### Events not appearing in exports

1. Check if events were logged: `SELECT COUNT(*) FROM events WHERE created_at >= '2025-10-19'`
2. Verify cron job ran: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 1`
3. Check storage bucket permissions

### Duplicate events

Duplicates are automatically detected by the unique constraint on `(session_id, idempotency_key)`. The API returns the count of duplicates for monitoring.

### Offline queue growing too large

Events are stored in localStorage with a 5-second flush interval. If the queue grows beyond 1000 events, consider:
- Reducing batch size
- Increasing flush frequency
- Adding a max queue size with overflow handling
