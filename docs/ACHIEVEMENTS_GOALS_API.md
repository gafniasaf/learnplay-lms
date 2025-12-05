# Student Achievements & Goals API

## Table of Contents
- [Student Achievements API](#student-achievements-api)
- [Student Goals API](#student-goals-api)

---

# Student Achievements API

## Edge Function: student-achievements

### Endpoint
```
GET /functions/v1/student-achievements
```

### Authentication
Requires valid JWT token in Authorization header.

### Query Parameters
- `studentId` (optional, UUID): Target student ID. If omitted, returns authenticated user's achievements
- `status` (optional, enum): Filter by status (`earned`, `in_progress`, `locked`)

### Response Schema
```typescript
{
  achievements: Array<{
    id: string;
    student_id: string;
    badge_code: string;
    title: string;
    description: string;
    status: "earned" | "in_progress" | "locked";
    progress_pct: number; // 0-100
    earned_at: string | null; // ISO 8601 timestamp
    created_at: string;
    updated_at: string;
  }>;
  summary: {
    total: number;
    earned: number;
    inProgress: number;
    locked: number;
  };
}
```

### Sample Response
```json
{
  "achievements": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
      "badge_code": "week-warrior",
      "title": "Week Warrior",
      "description": "Maintain a 7-day learning streak",
      "status": "earned",
      "progress_pct": 100,
      "earned_at": "2025-10-29T09:15:00Z",
      "created_at": "2025-10-22T10:00:00Z",
      "updated_at": "2025-10-29T09:15:00Z"
    },
    {
      "id": "b58cd31d-79ee-6594-c789-2g24d4e5f691",
      "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
      "badge_code": "master-learner",
      "title": "Master Learner",
      "description": "Complete 20 courses",
      "status": "in_progress",
      "progress_pct": 40,
      "earned_at": null,
      "created_at": "2025-10-15T14:20:00Z",
      "updated_at": "2025-10-30T11:30:00Z"
    },
    {
      "id": "c69de42e-80ff-7605-d890-3h35e5f6g702",
      "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
      "badge_code": "month-champion",
      "title": "Month Champion",
      "description": "Maintain a 30-day streak",
      "status": "locked",
      "progress_pct": 0,
      "earned_at": null,
      "created_at": "2025-10-15T14:20:00Z",
      "updated_at": "2025-10-15T14:20:00Z"
    }
  ],
  "summary": {
    "total": 10,
    "earned": 4,
    "inProgress": 3,
    "locked": 3
  }
}
```

### Achievement Status Flow
- `locked`: Not yet available (prerequisites not met)
- `in_progress`: Available and user is working towards it
- `earned`: Successfully completed

### Common Badge Codes
- `first-steps`: Complete first course
- `week-warrior`: 7-day streak
- `month-champion`: 30-day streak
- `perfect-score`: 100% on assignment
- `master-learner`: Complete 20 courses
- `early-bird`: Complete 5 courses before deadline
- `speed-demon`: Complete 10 courses in one day
- `social-butterfly`: Join 3 classes
- `platinum-star`: Earn 10,000 XP
- `mentor`: Help 5 classmates

## Test Examples

### cURL Examples

#### Get own achievements
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-achievements' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Filter by status
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-achievements?status=earned' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Parent/teacher viewing student achievements
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-achievements?studentId=147aa362-c398-47ea-baab-2256a3e240df' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

### JavaScript Example
```javascript
import { supabase } from '@/integrations/supabase/client';

async function getStudentAchievements(studentId = null, status = null) {
  const params = new URLSearchParams();
  if (studentId) params.append('studentId', studentId);
  if (status) params.append('status', status);
  
const { data, error } = await supabase.functions.invoke(
    `student-achievements${params.toString() ? '?' + params.toString() : ''}`,
    { method: 'GET' }
  );
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  return data;
}

// Usage
const achievements = await getStudentAchievements();
console.log(`Total: ${achievements.summary.total}, Earned: ${achievements.summary.earned}`);
```

### React Component Example
```tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function AchievementsList() {
  const [achievements, setAchievements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const loadAchievements = async () => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      
const { data, error } = await supabase.functions.invoke(
        `student-achievements${params.toString() ? '?' + params.toString() : ''}`,
        { method: 'GET' }
      );
      
      if (!error) {
        setAchievements(data.achievements);
        setSummary(data.summary);
      }
    };
    
    loadAchievements();
  }, [filter]);

  return (
    <div>
      <div>
        <button onClick={() => setFilter('all')}>All ({summary?.total})</button>
        <button onClick={() => setFilter('earned')}>Earned ({summary?.earned})</button>
        <button onClick={() => setFilter('in_progress')}>In Progress ({summary?.inProgress})</button>
        <button onClick={() => setFilter('locked')}>Locked ({summary?.locked})</button>
      </div>
      
      {achievements.map(achievement => (
        <div key={achievement.id}>
          <h3>{achievement.title}</h3>
          <p>{achievement.description}</p>
          <span>Status: {achievement.status}</span>
          {achievement.status === 'in_progress' && (
            <progress value={achievement.progress_pct} max="100" />
          )}
        </div>
      ))}
    </div>
  );
}
```

## Postman Collection Entry
```json
{
  "name": "Get Student Achievements",
  "request": {
    "method": "GET",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{jwt_token}}",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{supabase_url}}/functions/v1/student-achievements?status=earned",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "student-achievements"],
      "query": [
        {
          "key": "status",
          "value": "earned",
          "description": "Filter by status (earned|in_progress|locked)",
          "disabled": true
        },
        {
          "key": "studentId",
          "value": "",
          "description": "Target student ID (for parents/teachers)",
          "disabled": true
        }
      ]
    }
  }
}
```

---

# Student Goals API

## Edge Function: student-goals

### Endpoints

#### GET - List Goals
```
GET /functions/v1/student-goals
```

#### PATCH - Update Goal (Teacher Only)
```
PATCH /functions/v1/student-goals/:goalId
```

### Authentication
Requires valid JWT token in Authorization header.

### GET Query Parameters
- `studentId` (optional, UUID): Target student ID. If omitted, returns authenticated user's goals
- `status` (optional, enum): Filter by status (`on_track`, `behind`, `completed`)

### GET Response Schema
```typescript
{
  goals: Array<{
    id: string;
    student_id: string;
    title: string;
    target_minutes: number;
    progress_minutes: number;
    due_at: string | null; // ISO 8601 timestamp
    status: "on_track" | "behind" | "completed";
    teacher_note: string | null;
    created_at: string;
    updated_at: string;
  }>;
  summary: {
    total: number;
    onTrack: number;
    behind: number;
    completed: number;
  };
}
```

### PATCH Request Schema
```typescript
{
  progress_minutes?: number; // Students and teachers can update
  status?: "on_track" | "behind" | "completed"; // Teachers only
  teacher_note?: string; // Teachers only
}
```

### Sample GET Response
```json
{
  "goals": [
    {
      "id": "d70ef53f-91gg-8716-e901-4i46f6g7h813",
      "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
      "title": "Complete 200 minutes of math this week",
      "target_minutes": 200,
      "progress_minutes": 120,
      "due_at": "2025-11-03T23:59:59Z",
      "status": "on_track",
      "teacher_note": "Great progress so far!",
      "created_at": "2025-10-27T10:00:00Z",
      "updated_at": "2025-10-30T15:30:00Z"
    },
    {
      "id": "e81fg64g-02hh-9827-f012-5j57g7h8i924",
      "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
      "title": "Daily practice: 30 minutes per day",
      "target_minutes": 210,
      "progress_minutes": 85,
      "due_at": "2025-11-02T23:59:59Z",
      "status": "behind",
      "teacher_note": "Try to catch up this weekend",
      "created_at": "2025-10-24T10:00:00Z",
      "updated_at": "2025-10-30T18:45:00Z"
    },
    {
      "id": "f92gh75h-13ii-0938-g123-6k68h8i9j035",
      "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
      "title": "Complete Science: Plant Biology",
      "target_minutes": 120,
      "progress_minutes": 120,
      "due_at": "2025-10-28T23:59:59Z",
      "status": "completed",
      "teacher_note": "Excellent work! Perfect score achieved.",
      "created_at": "2025-10-20T10:00:00Z",
      "updated_at": "2025-10-28T16:45:00Z"
    }
  ],
  "summary": {
    "total": 5,
    "onTrack": 2,
    "behind": 1,
    "completed": 2
  }
}
```

### Sample PATCH Request (Teacher)
```json
{
  "status": "on_track",
  "teacher_note": "Good improvement! Keep up the pace."
}
```

### Sample PATCH Response
```json
{
  "id": "e81fg64g-02hh-9827-f012-5j57g7h8i924",
  "student_id": "147aa362-c398-47ea-baab-2256a3e240df",
  "title": "Daily practice: 30 minutes per day",
  "target_minutes": 210,
  "progress_minutes": 85,
  "due_at": "2025-11-02T23:59:59Z",
  "status": "on_track",
  "teacher_note": "Good improvement! Keep up the pace.",
  "created_at": "2025-10-24T10:00:00Z",
  "updated_at": "2025-10-31T10:15:00Z"
}
```

## Test Examples

### cURL Examples

#### Get own goals
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-goals' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Filter by status
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-goals?status=behind' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Teacher viewing student goals
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-goals?studentId=147aa362-c398-47ea-baab-2256a3e240df' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Teacher updating goal status and note
```bash
curl -X PATCH \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-goals/e81fg64g-02hh-9827-f012-5j57g7h8i924' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "on_track",
    "teacher_note": "Good improvement! Keep up the pace."
  }'
```

#### Student updating progress
```bash
curl -X PATCH \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/student-goals/e81fg64g-02hh-9827-f012-5j57g7h8i924' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "progress_minutes": 125
  }'
```

### JavaScript Example
```javascript
import { supabase } from '@/integrations/supabase/client';

// Get goals
async function getStudentGoals(studentId = null, status = null) {
  const params = new URLSearchParams();
  if (studentId) params.append('studentId', studentId);
  if (status) params.append('status', status);
  
const { data, error } = await supabase.functions.invoke(
    `student-goals${params.toString() ? '?' + params.toString() : ''}`,
    { method: 'GET' }
  );
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  return data;
}

// Update goal (teacher)
async function updateGoal(goalId, updates) {
  const { data, error } = await supabase.functions.invoke(
    `student-goals/${goalId}`,
    {
      method: 'PATCH',
      body: updates,
    }
  );
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  return data;
}

// Usage
const goals = await getStudentGoals();
console.log(`Behind: ${goals.summary.behind}, On Track: ${goals.summary.onTrack}`);

// Teacher updates goal
await updateGoal('goal-uuid-here', {
  status: 'on_track',
  teacher_note: 'Great improvement!',
});
```

### React Component Example
```tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function GoalsList({ isTeacher = false }) {
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState(null);

  const loadGoals = async () => {
const { data, error } = await supabase.functions.invoke('student-goals', { method: 'GET' });
    
    if (!error) {
      setGoals(data.goals);
      setSummary(data.summary);
    }
  };

  const updateGoalProgress = async (goalId, progressMinutes) => {
    const { data, error } = await supabase.functions.invoke(
      `student-goals/${goalId}`,
      {
        method: 'PATCH',
        body: { progress_minutes: progressMinutes },
      }
    );
    
    if (!error) {
      loadGoals(); // Refresh
    }
  };

  const updateGoalStatus = async (goalId, status, note) => {
    if (!isTeacher) return;
    
    const { data, error } = await supabase.functions.invoke(
      `student-goals/${goalId}`,
      {
        method: 'PATCH',
        body: { status, teacher_note: note },
      }
    );
    
    if (!error) {
      loadGoals(); // Refresh
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  return (
    <div>
      <h2>Goals ({summary?.total})</h2>
      <p>On Track: {summary?.onTrack} | Behind: {summary?.behind} | Completed: {summary?.completed}</p>
      
      {goals.map(goal => (
        <div key={goal.id} className={`goal-${goal.status}`}>
          <h3>{goal.title}</h3>
          <progress 
            value={goal.progress_minutes} 
            max={goal.target_minutes}
          />
          <p>{goal.progress_minutes} / {goal.target_minutes} minutes</p>
          <span>Status: {goal.status}</span>
          
          {goal.teacher_note && (
            <p><strong>Teacher:</strong> {goal.teacher_note}</p>
          )}
          
          {isTeacher && (
            <div>
              <button onClick={() => updateGoalStatus(goal.id, 'on_track', 'Keep it up!')}>
                Mark On Track
              </button>
              <button onClick={() => updateGoalStatus(goal.id, 'behind', 'Need more focus')}>
                Mark Behind
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Postman Collection Entries

### GET Goals
```json
{
  "name": "Get Student Goals",
  "request": {
    "method": "GET",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{jwt_token}}",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{supabase_url}}/functions/v1/student-goals",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "student-goals"],
      "query": [
        {
          "key": "status",
          "value": "behind",
          "disabled": true
        },
        {
          "key": "studentId",
          "value": "",
          "disabled": true
        }
      ]
    }
  }
}
```

### PATCH Goal
```json
{
  "name": "Update Student Goal",
  "request": {
    "method": "PATCH",
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
    "body": {
      "mode": "raw",
      "raw": "{\n  \"status\": \"on_track\",\n  \"teacher_note\": \"Good improvement!\"\n}"
    },
    "url": {
      "raw": "{{supabase_url}}/functions/v1/student-goals/{{goal_id}}",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "student-goals", "{{goal_id}}"]
    }
  }
}
```

## RLS Access Control

### Achievements
- **Students**: View and manage own achievements
- **Parents**: View linked children's achievements
- **Teachers/School Admins**: View org students' achievements

### Goals
- **Students**: View own goals, update progress_minutes only
- **Parents**: View linked children's goals (read-only)
- **Teachers/School Admins**: Full access (view, create, update all fields including status and teacher_note)

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "code": "invalid_request",
    "message": "Validation failed: status must be one of on_track, behind, completed"
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

### 403 Forbidden (Student trying to update status)
```json
{
  "error": {
    "code": "forbidden",
    "message": "Only teachers can update goal status or notes"
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
    "message": "Failed to fetch achievements"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

## Testing Checklist

### Achievements
- [ ] Student can view own achievements
- [ ] Student cannot view other students' achievements
- [ ] Parent can view linked child's achievements
- [ ] Teacher can view org student's achievements
- [ ] Status filter works correctly
- [ ] Summary statistics accurate
- [ ] Progress percentages valid (0-100)
- [ ] Earned achievements have earned_at timestamp

### Goals
- [ ] Student can view own goals
- [ ] Student can update progress_minutes
- [ ] Student cannot update status or teacher_note
- [ ] Parent can view child's goals (read-only)
- [ ] Teacher can view org student's goals
- [ ] Teacher can update all goal fields
- [ ] Status filter works correctly
- [ ] Summary statistics accurate
- [ ] PATCH endpoint validates permissions
- [ ] Goal ID required in PATCH URL
