# Parent Dashboard & Child Management API

## Table of Contents
- [Parent Dashboard API](#parent-dashboard-api)
- [Parent Children API](#parent-children-api)

---

# Parent Dashboard API

## Edge Function: parent-dashboard

### Endpoint
```
GET /functions/v1/parent-dashboard
```

### Authentication
Requires valid JWT token in Authorization header (parent user).

### Query Parameters
- `parentId` (optional, UUID): Target parent ID. If omitted, returns authenticated parent's dashboard

### Response Schema
```typescript
{
  parentId: string;
  children: Array<{
    studentId: string;
    studentName: string;
    linkStatus: "active" | "pending" | "inactive";
    linkedAt: string; // ISO 8601 timestamp
    metrics: {
      streakDays: number;
      xpTotal: number;
      lastLoginAt: string | null;
      recentActivityCount: number; // Last 7 days
    };
    upcomingAssignments: {
      count: number;
      items: Array<{
        id: string;
        title: string;
        courseId: string;
        dueAt: string;
        status: string;
        progressPct: number;
      }>;
    };
    alerts: {
      overdueAssignments: number;
      goalsBehind: number;
      needsAttention: boolean;
    };
  }>;
  summary: {
    totalChildren: number;
    totalAlerts: number;
    averageStreak: number;
    totalXp: number;
  };
}
```

### Sample Response
```json
{
  "parentId": "a7f8e9d0-1234-5678-9abc-def012345678",
  "children": [
    {
      "studentId": "147aa362-c398-47ea-baab-2256a3e240df",
      "studentName": "Alex Johnson",
      "linkStatus": "active",
      "linkedAt": "2025-10-01T10:00:00Z",
      "metrics": {
        "streakDays": 7,
        "xpTotal": 1250,
        "lastLoginAt": "2025-10-30T15:30:00Z",
        "recentActivityCount": 15
      },
      "upcomingAssignments": {
        "count": 3,
        "items": [
          {
            "id": "assignment-1",
            "title": "English Modals Practice",
            "courseId": "english-modals",
            "dueAt": "2025-11-02T23:59:59Z",
            "status": "in_progress",
            "progressPct": 68
          },
          {
            "id": "assignment-2",
            "title": "Fractions Quiz",
            "courseId": "math-fractions",
            "dueAt": "2025-11-05T23:59:59Z",
            "status": "not_started",
            "progressPct": 0
          }
        ]
      },
      "alerts": {
        "overdueAssignments": 0,
        "goalsBehind": 1,
        "needsAttention": true
      }
    },
    {
      "studentId": "b086f523-3e22-4938-930a-0287611535a7",
      "studentName": "Jamie Smith",
      "linkStatus": "active",
      "linkedAt": "2025-09-15T14:20:00Z",
      "metrics": {
        "streakDays": 3,
        "xpTotal": 580,
        "lastLoginAt": "2025-10-31T09:15:00Z",
        "recentActivityCount": 8
      },
      "upcomingAssignments": {
        "count": 2,
        "items": [
          {
            "id": "assignment-3",
            "title": "Algebra Basics",
            "courseId": "math-algebra",
            "dueAt": "2025-11-07T23:59:59Z",
            "status": "in_progress",
            "progressPct": 45
          }
        ]
      },
      "alerts": {
        "overdueAssignments": 1,
        "goalsBehind": 2,
        "needsAttention": true
      }
    }
  ],
  "summary": {
    "totalChildren": 2,
    "totalAlerts": 4,
    "averageStreak": 5,
    "totalXp": 1830
  }
}
```

## Test Examples

### cURL Example
```bash
# Get own parent dashboard
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/parent-dashboard' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

### JavaScript Example
```javascript
import { supabase } from '@/integrations/supabase/client';

async function getParentDashboard() {
const { data, error } = await supabase.functions.invoke('parent-dashboard', { method: 'GET' });
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  return data;
}

// Usage
const dashboard = await getParentDashboard();
console.log(`Total children: ${dashboard.summary.totalChildren}`);
console.log(`Total alerts: ${dashboard.summary.totalAlerts}`);

dashboard.children.forEach(child => {
  console.log(`${child.studentName}: ${child.upcomingAssignments.count} assignments`);
  if (child.alerts.needsAttention) {
    console.log(`  ⚠️ Needs attention!`);
  }
});
```

### React Component Example
```tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function ParentDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      const { data, error } = await supabase.functions.invoke('parent-dashboard', { method: 'GET' });
      if (!error) setDashboard(data);
      setLoading(false);
    };
    
    loadDashboard();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Parent Dashboard</h1>
      <div className="summary">
        <p>Children: {dashboard.summary.totalChildren}</p>
        <p>Total XP: {dashboard.summary.totalXp}</p>
        <p>Avg Streak: {dashboard.summary.averageStreak} days</p>
        {dashboard.summary.totalAlerts > 0 && (
          <p className="alert">⚠️ {dashboard.summary.totalAlerts} alerts</p>
        )}
      </div>
      
      <div className="children">
        {dashboard.children.map(child => (
          <div key={child.studentId} className="child-card">
            <h2>{child.studentName}</h2>
            <p>Streak: {child.metrics.streakDays} days</p>
            <p>XP: {child.metrics.xpTotal}</p>
            <p>Upcoming: {child.upcomingAssignments.count} assignments</p>
            
            {child.alerts.needsAttention && (
              <div className="alerts">
                {child.alerts.overdueAssignments > 0 && (
                  <p>⚠️ {child.alerts.overdueAssignments} overdue assignments</p>
                )}
                {child.alerts.goalsBehind > 0 && (
                  <p>⚠️ {child.alerts.goalsBehind} goals behind</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Postman Collection Entry
```json
{
  "name": "Get Parent Dashboard",
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
      "raw": "{{supabase_url}}/functions/v1/parent-dashboard",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "parent-dashboard"]
    }
  }
}
```

---

# Parent Children API

## Edge Function: parent-children

### Endpoints

#### GET - List Linked Children
```
GET /functions/v1/parent-children
```

#### DELETE - Unlink Child
```
DELETE /functions/v1/parent-children/:studentId
```

### Authentication
Requires valid JWT token in Authorization header (parent user).

### GET Response Schema
```typescript
{
  children: Array<{
    studentId: string;
    studentName: string;
    linkStatus: "active" | "pending" | "inactive";
    linkedAt: string;
    grade: string | null;
    school: string | null;
    lastLoginAt: string | null;
    streakDays: number;
    xpTotal: number;
  }>;
  summary: {
    active: number;
    pending: number;
    total: number;
  };
}
```

### DELETE Response Schema
```typescript
{
  success: boolean;
  message: string;
  studentId: string;
}
```

### Sample GET Response
```json
{
  "children": [
    {
      "studentId": "147aa362-c398-47ea-baab-2256a3e240df",
      "studentName": "Alex Johnson",
      "linkStatus": "active",
      "linkedAt": "2025-10-01T10:00:00Z",
      "grade": null,
      "school": "Lincoln Elementary",
      "lastLoginAt": "2025-10-30T15:30:00Z",
      "streakDays": 7,
      "xpTotal": 1250
    },
    {
      "studentId": "c197g634-d109-5049-031b-de3123456789",
      "studentName": "Taylor Davis",
      "linkStatus": "pending",
      "linkedAt": "2025-10-30T12:00:00Z",
      "grade": null,
      "school": null,
      "lastLoginAt": null,
      "streakDays": 0,
      "xpTotal": 0
    }
  ],
  "summary": {
    "active": 1,
    "pending": 1,
    "total": 2
  }
}
```

### Sample DELETE Response
```json
{
  "success": true,
  "message": "Child successfully unlinked",
  "studentId": "147aa362-c398-47ea-baab-2256a3e240df"
}
```

## Test Examples

### cURL Examples

#### List linked children
```bash
curl -X GET \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/parent-children' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Unlink a child
```bash
curl -X DELETE \
  'https://grffepyrmjihphldyfha.supabase.co/functions/v1/parent-children/147aa362-c398-47ea-baab-2256a3e240df' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

### JavaScript Examples

```javascript
import { supabase } from '@/integrations/supabase/client';

// List linked children
async function getLinkedChildren() {
const { data, error } = await supabase.functions.invoke('parent-children', { method: 'GET' });
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  return data;
}

// Unlink a child
async function unlinkChild(studentId) {
  const { data, error } = await supabase.functions.invoke(
    `parent-children/${studentId}`,
    { method: 'DELETE' }
  );
  
  if (error) {
    console.error('Error:', error);
    return false;
  }
  
  return data.success;
}

// Usage
const children = await getLinkedChildren();
console.log(`Total: ${children.summary.total}, Active: ${children.summary.active}, Pending: ${children.summary.pending}`);

// Unlink a child
const success = await unlinkChild('student-id-here');
if (success) {
  console.log('Child successfully unlinked');
}
```

### React Component Example
```tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function LinkedChildren() {
  const [children, setChildren] = useState([]);
  const [summary, setSummary] = useState(null);

  const loadChildren = async () => {
const { data, error } = await supabase.functions.invoke('parent-children', { method: 'GET' });
    if (!error) {
      setChildren(data.children);
      setSummary(data.summary);
    }
  };

  const handleUnlink = async (studentId, studentName) => {
    if (!confirm(`Remove link to ${studentName}?`)) return;
    
    const { data, error } = await supabase.functions.invoke(
      `parent-children/${studentId}`,
      { method: 'DELETE' }
    );
    
    if (!error) {
      loadChildren(); // Refresh list
      alert('Child successfully unlinked');
    }
  };

  useEffect(() => {
    loadChildren();
  }, []);

  return (
    <div>
      <h2>Linked Children ({summary?.total || 0})</h2>
      <p>Active: {summary?.active} | Pending: {summary?.pending}</p>
      
      <div className="children-list">
        {children.map(child => (
          <div key={child.studentId} className={`child-item ${child.linkStatus}`}>
            <h3>{child.studentName}</h3>
            <p>Status: {child.linkStatus}</p>
            {child.school && <p>School: {child.school}</p>}
            <p>Streak: {child.streakDays} days | XP: {child.xpTotal}</p>
            {child.lastLoginAt && (
              <p>Last login: {new Date(child.lastLoginAt).toLocaleDateString()}</p>
            )}
            
            <button onClick={() => handleUnlink(child.studentId, child.studentName)}>
              Unlink
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Postman Collection Entries

### GET Children
```json
{
  "name": "Get Linked Children",
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
      "raw": "{{supabase_url}}/functions/v1/parent-children",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "parent-children"]
    }
  }
}
```

### DELETE Child Link
```json
{
  "name": "Unlink Child",
  "request": {
    "method": "DELETE",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{jwt_token}}",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{supabase_url}}/functions/v1/parent-children/{{student_id}}",
      "host": ["{{supabase_url}}"],
      "path": ["functions", "v1", "parent-children", "{{student_id}}"]
    }
  }
}
```

## Link Status Flow
- `pending`: Link request sent, awaiting acceptance
- `active`: Link confirmed and active
- `inactive`: Link disabled (not deleted, can be reactivated)

## RLS Access Control

### parent_children Table
- **Parents**: Can view, create, and delete their own links
- **Students**: Can view links where they are the child
- **Teachers/Admins**: No special access to parent-child links

### parent_child_details View
- **Parents**: Can query the view for their linked children (automatically filtered by parent_id)
- **Students**: Cannot access this view
- **Teachers/Admins**: No special access

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "code": "invalid_request",
    "message": "Valid student ID required in path"
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
    "message": "Failed to fetch children"
  },
  "requestId": "uuid",
  "timestamp": "iso-timestamp"
}
```

## Testing Checklist

### Parent Dashboard
- [ ] Parent can view dashboard for all active linked children
- [ ] Dashboard includes correct metrics for each child
- [ ] Upcoming assignments limited to 3 per child
- [ ] Alerts calculated correctly
- [ ] Summary statistics accurate
- [ ] Empty state handled gracefully (no children)
- [ ] Parent cannot view other parents' dashboards

### Parent Children
- [ ] Parent can list all linked children
- [ ] Includes pending and active links
- [ ] Summary counts correct
- [ ] Parent can unlink a child
- [ ] Cannot unlink other parents' children
- [ ] School/grade info included if available
- [ ] Metrics accurate

## Database View Details

The `parent_child_details` view aggregates:
- Child profile information
- Student metrics (streak, XP, last login)
- Count of upcoming assignments
- Count of overdue assignments
- Count of goals behind schedule
- Recent activity count (last 7 days)

This view is optimized for parent dashboard queries and automatically filters to only show active links.
