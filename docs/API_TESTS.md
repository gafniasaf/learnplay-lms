# API Testing Documentation

## Table of Contents
- [Complete API Reference](./API_REFERENCE.md) - All endpoints, auth, CORS
- [Postman Collection](../reports/api-tests.postman.json) - Ready-to-use API tests
- [Environment Variables](../reports/environment-variables.md) - Frontend & backend config
- [CORS Verification](../reports/cors-verification.md) - CORS headers verification
- [Seed Data & Fixtures](./SEED_DATA.md) - Demo accounts for testing
- [Courses Catalog API](./COURSES_CATALOG_API.md) - Pagination, Filtering, Sorting
- [Play Session API](./PLAY_SESSION_API.md) - Session Recovery, Assignment Metadata
- [Results Detail API](./RESULTS_DETAIL_API.md) - Round Results, Question Breakdown
- [Admin Tag Management API](./ADMIN_TAG_API.md) - Create Tags, Authorization
- [Student Dashboard API](#student-dashboard-api)
- [Student Timeline API](#student-timeline-api)

---

# Student Dashboard API

## Edge Function: student-dashboard

### Endpoint
```
GET /functions/v1/student-dashboard
```

### Authentication
Requires valid JWT token in Authorization header.

### Response Format
```json
{
  "assignments": [
    {
      "id": "uuid",
      "student_id": "uuid",
      "course_id": "string",
      "title": "string",
      "due_at": "timestamp",
      "status": "not_started|in_progress|completed|overdue",
      "progress_pct": 0-100,
      "score": 0-100 (nullable),
      "updated_at": "timestamp",
      "created_at": "timestamp"
    }
  ],
  "performance": {
    "recentScore": 0-100,
    "streakDays": 0,
    "xp": 0
  },
  "recommendedCourses": [
    {
      "courseId": "string",
      "reason": "string",
      "createdAt": "timestamp"
    }
  ]
}
```

## Test Examples

### cURL Example
```bash
# Get student dashboard (replace TOKEN with actual JWT)
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-dashboard' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

### JavaScript Example
```javascript
import { supabase } from '@/integrations/supabase/client';

async function getStudentDashboard() {
const { data, error } = await supabase.functions.invoke('student-dashboard', { method: 'GET' });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Dashboard data:', data);
  return data;
}
```

## Postman Collection Entry

```json
{
  "name": "Get Student Dashboard",
  "request": {
    "method": "GET",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{jwt_token}}",
        "type": "text"
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{supabase_url}}/functions/v1/student-dashboard",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "student-dashboard"]
    }
  },
  "response": []
}
```

## Empty State Handling

The API gracefully handles empty states:
- No assignments: Returns empty array `[]`
- No metrics: Returns default values (streakDays: 0, xp: 0, recentScore: 0)
- No recommendations: Returns empty array `[]`

## Error Responses

### 401 Unauthorized
```json
{
  "error": {
    "code": "no_auth",
    "message": "Authorization header required"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

### 403 Forbidden
```json
{
  "error": {
    "code": "invalid_auth",
    "message": "Invalid or expired token"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

### 500 Internal Error
```json
{
  "error": {
    "code": "internal_error",
    "message": "Detailed error message"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

## Testing Checklist

- [ ] Anonymous request returns 401
- [ ] Valid student token returns their data only
- [ ] Empty state returns default values
- [ ] Teacher can view student dashboard data for their org
- [ ] Student cannot view other students' data
- [ ] All timestamps are in ISO 8601 format
- [ ] Score calculations are accurate
- [ ] Recommendations are ordered by created_at (newest first)
- [ ] Assignments are ordered by due_at (earliest first)

---

# Student Timeline API

## Edge Function: student-timeline

### Endpoint
```
GET /functions/v1/student-timeline
```

### Authentication
Requires valid JWT token in Authorization header.

### Query Parameters
- `studentId` (optional, UUID): Target student ID. If omitted, returns authenticated user's timeline
- `limit` (optional, number, 1-100, default: 50): Number of events to return per page
- `cursor` (optional, string): Pagination cursor (ISO timestamp from previous response's `nextCursor`)

### Response Format
```json
{
  "events": [
    {
      "id": "uuid",
      "student_id": "uuid",
      "event_type": "assignment_completed|badge_earned|joined_class|level_up|streak_milestone|course_started|perfect_score|login",
      "description": "Human-readable event description",
      "metadata": {
        "course_id": "string",
        "score": 100,
        "badge_name": "Week Warrior",
        "class_name": "Ms. Johnson's Class"
      },
      "occurred_at": "2025-10-30T15:30:00Z"
    }
  ],
  "nextCursor": "2025-10-23T10:15:00Z",
  "hasMore": true
}
```

### Event Types
- `assignment_completed`: Student completed an assignment
- `badge_earned`: Student earned a new badge or achievement
- `joined_class`: Student joined a new class
- `level_up`: Student reached a new level in a subject
- `streak_milestone`: Student hit a streak milestone (3, 7, 14, 30 days)
- `course_started`: Student started a new course
- `perfect_score`: Student got a perfect score on an assignment
- `login`: Student logged in (can be filtered out on frontend)

### Sample Payloads

#### Assignment Completed Event
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
  "event_type": "assignment_completed",
  "description": "Completed History: Ancient Civilizations",
  "metadata": {
    "course_id": "history-ancient",
    "score": 88,
    "time_spent_minutes": 45
  },
  "occurred_at": "2025-10-30T14:22:10Z"
}
```

#### Badge Earned Event
```json
{
  "id": "a47bc20c-68dd-5483-b678-1f13c3d4e580",
  "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
  "event_type": "badge_earned",
  "description": "Earned \"Week Warrior\" badge for 7-day streak",
  "metadata": {
    "badge_id": "week-warrior",
    "badge_name": "Week Warrior",
    "badge_icon": "trophy"
  },
  "occurred_at": "2025-10-29T09:15:00Z"
}
```

#### Joined Class Event
```json
{
  "id": "b58cd31d-79ee-6594-c789-2g24d4e5f691",
  "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
  "event_type": "joined_class",
  "description": "Joined Ms. Johnson's Class",
  "metadata": {
    "class_id": "class-001",
    "class_name": "Ms. Johnson's English Class",
    "teacher": "Ms. Johnson"
  },
  "occurred_at": "2025-10-17T11:30:00Z"
}
```

#### Perfect Score Event
```json
{
  "id": "c69de42e-80ff-7605-d890-3h35e5f6g702",
  "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
  "event_type": "perfect_score",
  "description": "Perfect score on Science: Plant Biology",
  "metadata": {
    "course_id": "science-plants",
    "score": 100
  },
  "occurred_at": "2025-10-28T16:45:00Z"
}
```

## Test Examples

### cURL Examples

#### Get own timeline (first page)
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-timeline?limit=20' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Get next page using cursor
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-timeline?limit=20&cursor=2025-10-23T10:15:00Z' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Teacher/parent viewing student timeline
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-timeline?studentId=147aa362-c398-47ea-baab-2256a3e240df&limit=50' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

### JavaScript Example

```javascript
import { supabase } from '@/integrations/supabase/client';

async function getStudentTimeline(cursor = null, limit = 50) {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  
const { data, error } = await supabase.functions.invoke(
    `student-timeline?${params.toString()}`,
    { method: 'GET' }
  );
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  return data;
}

// Usage: Load first page
const firstPage = await getStudentTimeline();
console.log('Events:', firstPage.events);

// Load next page if available
if (firstPage.hasMore) {
  const nextPage = await getStudentTimeline(firstPage.nextCursor);
  console.log('More events:', nextPage.events);
}
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

function useStudentTimeline(initialLimit = 50) {
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: initialLimit.toString() });
      if (cursor) params.append('cursor', cursor);
      
const { data, error } = await supabase.functions.invoke(
        `student-timeline?${params.toString()}`,
        { method: 'GET' }
      );
      
      if (error) throw error;
      
      setEvents(prev => [...prev, ...data.events]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to load timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMore();
  }, []);

  return { events, hasMore, loading, loadMore };
}
```

## Postman Collection Entry

```json
{
  "name": "Get Student Timeline",
  "request": {
    "method": "GET",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{jwt_token}}",
        "type": "text"
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{supabase_url}}/functions/v1/student-timeline?limit=50",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "student-timeline"],
      "query": [
        {
          "key": "limit",
          "value": "50",
          "description": "Number of events per page (1-100)"
        },
        {
          "key": "cursor",
          "value": "",
          "description": "Pagination cursor from previous response",
          "disabled": true
        },
        {
          "key": "studentId",
          "value": "",
          "description": "Target student ID (optional)",
          "disabled": true
        }
      ]
    }
  },
  "response": []
}
```

## Pagination Details

The API uses **cursor-based pagination** for efficient large dataset traversal:

1. **First request**: Omit `cursor` parameter
2. **Subsequent requests**: Use `nextCursor` from previous response
3. **Detection**: `hasMore: false` indicates last page
4. **Cursor format**: ISO 8601 timestamp of last event in current page

### Pagination Example
```
Request 1: GET /student-timeline?limit=50
Response 1: { events: [...50 items], nextCursor: "2025-10-15T14:30:00Z", hasMore: true }

Request 2: GET /student-timeline?limit=50&cursor=2025-10-15T14:30:00Z
Response 2: { events: [...50 items], nextCursor: "2025-09-30T10:00:00Z", hasMore: true }

Request 3: GET /student-timeline?limit=50&cursor=2025-09-30T10:00:00Z
Response 3: { events: [...12 items], nextCursor: null, hasMore: false }
```

## Empty State Handling

The API gracefully handles empty states:
- No events: Returns `{ events: [], nextCursor: null, hasMore: false }`
- RLS denial: Returns empty array (not an error)

## Performance Notes

- **Index**: Query uses `idx_student_activity_log_pagination` on `(student_id, occurred_at DESC)` for optimal performance
- **Limit bounds**: Max 100 events per request to prevent overload
- **Cursor efficiency**: Timestamp-based cursor avoids offset scanning

## Error Responses

### 400 Bad Request (Invalid Parameters)
```json
{
  "error": {
    "code": "invalid_request",
    "message": "Validation failed: limit must be between 1 and 100"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

### 401 Unauthorized
```json
{
  "error": {
    "code": "no_auth",
    "message": "Authorization header required"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

### 403 Forbidden (RLS Denial)
```json
{
  "error": {
    "code": "invalid_auth",
    "message": "Invalid or expired token"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

### 500 Internal Error
```json
{
  "error": {
    "code": "internal_error",
    "message": "Failed to fetch timeline events"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

## RLS Access Control

- **Students**: Can view their own timeline only
- **Parents**: Can view timelines of linked children via `parent_children` table
- **Teachers**: Can view timelines of students in their organization
- **School Admins**: Same as teachers

## Testing Checklist

- [ ] Anonymous request returns 401
- [ ] Student can view own timeline
- [ ] Student cannot view other students' timeline (empty result)
- [ ] Parent can view linked child's timeline
- [ ] Teacher can view org student's timeline
- [ ] Pagination works correctly with cursor
- [ ] `hasMore` correctly indicates last page
- [ ] Empty state returns valid structure
- [ ] Limit parameter enforced (1-100)
- [ ] Invalid cursor returns empty or error
- [ ] Events sorted by `occurred_at DESC`
- [ ] All timestamps in ISO 8601 format
- [ ] Metadata structure matches event type
