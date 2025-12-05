# Parent Insights API Documentation

This document describes the parent-specific insight endpoints that provide detailed per-child analytics.

## Overview

These endpoints allow parents to view detailed insights about their linked children's learning progress, including:
- Subject mastery and trends
- Topic-level performance with recommendations
- Learning goals progress
- Activity timeline with filters

All endpoints require authentication and automatically verify parent-child relationships.

---

## 1. Parent Subjects API

### Endpoint
```
GET /functions/v1/parent-subjects
```

### Description
Returns subject-level mastery metrics, trends, and alert flags for a student.

### Authentication
Requires valid JWT token in Authorization header.

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| studentId | string (UUID) | Yes | Student's user ID |
| subject | string | No | Filter by specific subject (e.g., "math") |

### Response Schema
```typescript
{
  studentId: string;
  subjects: Array<{
    subject: string;
    masteryPct: number;
    trend: 'improving' | 'stable' | 'declining';
    alertFlag: boolean;
    totalSessions: number;
    recentAccuracy: number;
    previousAccuracy: number;
    lastPracticedAt: string | null;
  }>;
  summary: {
    totalSubjects: number;
    averageMastery: number;
    subjectsWithAlerts: number;
  };
  emptyState: boolean;
}
```

### Sample Response
```json
{
  "studentId": "123e4567-e89b-12d3-a456-426614174000",
  "subjects": [
    {
      "subject": "math",
      "masteryPct": 72,
      "trend": "declining",
      "alertFlag": true,
      "totalSessions": 15,
      "recentAccuracy": 70,
      "previousAccuracy": 82,
      "lastPracticedAt": "2025-01-30T14:30:00Z"
    },
    {
      "subject": "science",
      "masteryPct": 88,
      "trend": "improving",
      "alertFlag": false,
      "totalSessions": 12,
      "recentAccuracy": 90,
      "previousAccuracy": 85,
      "lastPracticedAt": "2025-01-31T10:15:00Z"
    }
  ],
  "summary": {
    "totalSubjects": 2,
    "averageMastery": 80,
    "subjectsWithAlerts": 1
  },
  "emptyState": false
}
```

### Empty State Response
```json
{
  "studentId": "123e4567-e89b-12d3-a456-426614174000",
  "subjects": [],
  "summary": {
    "totalSubjects": 0,
    "averageMastery": 0,
    "subjectsWithAlerts": 0
  },
  "emptyState": true,
  "message": "No practice sessions found for this student"
}
```

### cURL Example
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/parent-subjects?studentId=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### JavaScript Example
```javascript
const response = await fetch(
  `${supabaseUrl}/functions/v1/parent-subjects?studentId=${studentId}`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
const data = await response.json();
```

### React Hook Example
```typescript
const useParentSubjects = (studentId: string) => {
  return useQuery({
    queryKey: ['parent-subjects', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('parent-subjects', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId })
      });
      if (error) throw error;
      return data;
    }
  });
};
```

---

## 2. Parent Topics API

### Endpoint
```
GET /functions/v1/parent-topics
```

### Description
Returns topic-level performance with recommended actions based on accuracy.

### Authentication
Requires valid JWT token in Authorization header.

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| studentId | string (UUID) | Yes | Student's user ID |
| subject | string | No | Filter by specific subject |

### Response Schema
```typescript
{
  studentId: string;
  topics: Array<{
    topic: string;
    subject: string;
    accuracyPct: number;
    attempts: number;
    correctCount: number;
    lastPracticedAt: string;
    recommendedAction: 'review' | 'practice' | 'maintain' | 'advance';
    actionMessage: string;
  }>;
  summary: {
    totalTopics: number;
    averageAccuracy: number;
    topicsNeedingReview: number;
    topicsForPractice: number;
    topicsMastered: number;
  };
  emptyState: boolean;
}
```

### Recommended Actions
- **review**: Accuracy < 60% - Needs additional review
- **practice**: Accuracy 60-79% - Continue practicing
- **maintain**: Accuracy 80-94% - Keep practicing regularly
- **advance**: Accuracy ≥ 95% - Mastered, ready for advanced topics

### Sample Response
```json
{
  "studentId": "123e4567-e89b-12d3-a456-426614174000",
  "topics": [
    {
      "topic": "fractions",
      "subject": "math",
      "accuracyPct": 55,
      "attempts": 20,
      "correctCount": 11,
      "lastPracticedAt": "2025-01-30T14:30:00Z",
      "recommendedAction": "review",
      "actionMessage": "Needs additional review and practice"
    },
    {
      "topic": "decimals",
      "subject": "math",
      "accuracyPct": 92,
      "attempts": 25,
      "correctCount": 23,
      "lastPracticedAt": "2025-01-31T10:15:00Z",
      "recommendedAction": "maintain",
      "actionMessage": "Good progress, keep practicing regularly"
    }
  ],
  "summary": {
    "totalTopics": 2,
    "averageAccuracy": 73,
    "topicsNeedingReview": 1,
    "topicsForPractice": 0,
    "topicsMastered": 0
  },
  "emptyState": false
}
```

### Empty State Response
```json
{
  "studentId": "123e4567-e89b-12d3-a456-426614174000",
  "topics": [],
  "summary": {
    "totalTopics": 0,
    "averageAccuracy": 0,
    "topicsNeedingReview": 0,
    "topicsForPractice": 0,
    "topicsMastered": 0
  },
  "emptyState": true,
  "message": "No topic practice data found for this student"
}
```

---

## 3. Parent Goals API

### Endpoint
```
GET /functions/v1/parent-goals
```

### Description
Returns learning goals for linked children with progress tracking and status.

### Authentication
Requires valid JWT token in Authorization header.

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| studentId | string (UUID) | No | Filter by specific student |
| status | string | No | Filter by status: on_track, behind, completed |

### Response Schema
```typescript
{
  goals: Array<{
    id: string;
    studentId: string;
    studentName: string;
    title: string;
    targetMinutes: number;
    progressMinutes: number;
    progressPct: number;
    dueAt: string | null;
    status: 'on_track' | 'behind' | 'completed';
    teacherNote: string | null;
    createdAt: string;
    updatedAt: string;
    daysRemaining: number | null;
    isOverdue: boolean;
  }>;
  byStudent?: Record<string, Goal[]>; // Only when not filtering by studentId
  summary: {
    totalGoals: number;
    onTrack: number;
    behind: number;
    completed: number;
    overdue: number;
    averageProgress: number;
  };
  emptyState: boolean;
}
```

### Sample Response (Single Student)
```json
{
  "goals": [
    {
      "id": "goal-1",
      "studentId": "123e4567-e89b-12d3-a456-426614174000",
      "studentName": "Emma Johnson",
      "title": "Complete 300 minutes of math practice",
      "targetMinutes": 300,
      "progressMinutes": 180,
      "progressPct": 60,
      "dueAt": "2025-02-15T23:59:59Z",
      "status": "on_track",
      "teacherNote": "Great progress so far!",
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-31T14:30:00Z",
      "daysRemaining": 15,
      "isOverdue": false
    }
  ],
  "summary": {
    "totalGoals": 1,
    "onTrack": 1,
    "behind": 0,
    "completed": 0,
    "overdue": 0,
    "averageProgress": 60
  },
  "emptyState": false
}
```

### Sample Response (Multiple Students)
```json
{
  "goals": [
    {
      "id": "goal-1",
      "studentId": "student-1",
      "studentName": "Emma Johnson",
      "title": "Math practice goal",
      "targetMinutes": 300,
      "progressMinutes": 180,
      "progressPct": 60,
      "status": "on_track",
      "daysRemaining": 15,
      "isOverdue": false
    },
    {
      "id": "goal-2",
      "studentId": "student-2",
      "studentName": "Liam Smith",
      "title": "Reading comprehension",
      "targetMinutes": 200,
      "progressMinutes": 50,
      "progressPct": 25,
      "status": "behind",
      "daysRemaining": 5,
      "isOverdue": false
    }
  ],
  "byStudent": {
    "student-1": [
      { /* goal-1 */ }
    ],
    "student-2": [
      { /* goal-2 */ }
    ]
  },
  "summary": {
    "totalGoals": 2,
    "onTrack": 1,
    "behind": 1,
    "completed": 0,
    "overdue": 0,
    "averageProgress": 42
  },
  "emptyState": false
}
```

---

## 4. Parent Timeline API

### Endpoint
```
GET /functions/v1/parent-timeline
```

### Description
Returns activity timeline for linked children with date range filtering and pagination.

### Authentication
Requires valid JWT token in Authorization header.

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| studentId | string (UUID) | No | Filter by specific student |
| startDate | string (ISO 8601) | No | Filter events after this date |
| endDate | string (ISO 8601) | No | Filter events before this date |
| eventType | string | No | Filter by event type |
| limit | number | No | Max results (default: 50, max: 100) |
| cursor | string (ISO 8601) | No | Pagination cursor (occurred_at) |

### Event Types
- `assignment_completed`
- `badge_earned`
- `joined_class`
- `level_up`
- `streak_milestone`
- `course_started`
- `perfect_score`
- `login`

### Response Schema
```typescript
{
  events: Array<{
    id: string;
    studentId: string;
    studentName: string;
    eventType: string;
    description: string;
    metadata: Record<string, any>;
    occurredAt: string;
    createdAt: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  summary: {
    totalEvents: number;
    eventTypes: Record<string, number>;
    dateRange: {
      start: string | null;
      end: string | null;
    };
  };
  emptyState: boolean;
}
```

### Sample Response
```json
{
  "events": [
    {
      "id": "event-1",
      "studentId": "123e4567-e89b-12d3-a456-426614174000",
      "studentName": "Emma Johnson",
      "eventType": "assignment_completed",
      "description": "Completed math assignment: Fractions Practice",
      "metadata": {
        "assignmentId": "assign-1",
        "score": 95,
        "timeSpent": 45
      },
      "occurredAt": "2025-01-31T14:30:00Z",
      "createdAt": "2025-01-31T14:30:05Z"
    },
    {
      "id": "event-2",
      "studentId": "student-2",
      "studentName": "Liam Smith",
      "eventType": "badge_earned",
      "description": "Earned Math Master badge",
      "metadata": {
        "badgeCode": "math_master",
        "level": 2
      },
      "occurredAt": "2025-01-31T10:15:00Z",
      "createdAt": "2025-01-31T10:15:02Z"
    }
  ],
  "nextCursor": "2025-01-31T10:15:00Z",
  "hasMore": true,
  "summary": {
    "totalEvents": 2,
    "eventTypes": {
      "assignment_completed": 1,
      "badge_earned": 1
    },
    "dateRange": {
      "start": null,
      "end": null
    }
  },
  "emptyState": false
}
```

### cURL Example (Date Range)
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/parent-timeline?studentId=123&startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Pagination Example
```javascript
let allEvents = [];
let cursor = null;
let hasMore = true;

while (hasMore) {
  const url = new URL(`${supabaseUrl}/functions/v1/parent-timeline`);
  url.searchParams.set('studentId', studentId);
  url.searchParams.set('limit', '50');
  if (cursor) url.searchParams.set('cursor', cursor);
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  
  allEvents = [...allEvents, ...data.events];
  cursor = data.nextCursor;
  hasMore = data.hasMore;
}
```

---

## Common Features

### Empty State Handling
All endpoints return `emptyState: true` with a descriptive message when no data is found:
- No linked children
- No practice sessions/data
- Filters returned no results

### Access Control
- Parents can only view data for children linked via `parent_children` table
- All queries automatically verify parent-child relationships
- Returns 403 Forbidden if attempting to access unlinked student data

### Error Responses
```json
{
  "error": "Error message",
  "details": "Additional error information"
}
```

Common status codes:
- 400: Bad Request (missing/invalid parameters)
- 401: Unauthorized (missing/invalid token)
- 403: Forbidden (not authorized for this student)
- 500: Internal Server Error

---

## Performance Notes

### Subjects API
- Compares last 30 days vs older data for trend calculation
- Alert flag set when trend is declining or mastery < 70%
- Sorted by alert flag first, then by mastery

### Topics API
- Topics sorted by recommended action priority (review first)
- Action recommendations based on accuracy thresholds
- Includes last practiced timestamp

### Goals API
- Calculates days remaining and overdue status
- Groups by student when viewing multiple children
- Returns both individual goals and summary statistics

### Timeline API
- Cursor-based pagination for efficient large dataset handling
- Date range filtering for specific time periods
- Event type distribution in summary

---

## React Components Example

```typescript
// Parent Subjects Component
const ParentSubjects = ({ studentId }: { studentId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['parent-subjects', studentId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('parent-subjects', {
        body: { studentId }
      });
      return data;
    }
  });

  if (isLoading) return <Spinner />;
  if (data?.emptyState) return <EmptyState message={data.message} />;

  return (
    <div>
      <h2>Subject Performance</h2>
      {data.subjects.map(subject => (
        <SubjectCard key={subject.subject} subject={subject} />
      ))}
    </div>
  );
};

// Parent Timeline Component with Filters
const ParentTimeline = ({ studentId }: { studentId: string }) => {
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);
  const [eventType, setEventType] = useState<string | null>(null);

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['parent-timeline', studentId, dateRange, eventType],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ studentId });
      if (dateRange) {
        params.set('startDate', dateRange[0].toISOString());
        params.set('endDate', dateRange[1].toISOString());
      }
      if (eventType) params.set('eventType', eventType);
      if (pageParam) params.set('cursor', pageParam);

      const { data } = await supabase.functions.invoke('parent-timeline', {
        body: Object.fromEntries(params)
      });
      return data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor
  });

  return (
    <div>
      <TimelineFilters 
        onDateRangeChange={setDateRange}
        onEventTypeChange={setEventType}
      />
      <TimelineEvents events={data?.pages.flatMap(p => p.events)} />
      {hasNextPage && <LoadMoreButton onClick={fetchNextPage} />}
    </div>
  );
};
```

---

## Testing Checklist

- [ ] Verify parent-child relationship validation
- [ ] Test with empty data sets
- [ ] Test date range filtering (timeline)
- [ ] Test pagination (timeline, goals)
- [ ] Test subject filtering
- [ ] Test status filtering (goals)
- [ ] Test event type filtering (timeline)
- [ ] Verify alert flags are set correctly
- [ ] Verify trend calculations are accurate
- [ ] Test multiple children view vs single child
- [ ] Test unauthorized access (403 responses)
- [ ] Verify performance with large datasets
