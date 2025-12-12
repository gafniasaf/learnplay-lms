# Edge Function Response Contracts

This document defines the expected response shapes for dashboard-related Edge Functions. These contracts ensure that the frontend can properly transform Edge Function responses into the Dashboard interface format.

## Overview

Edge Functions return raw data from the database, but the frontend expects structured Dashboard objects. The `useDashboard` hook in `src/hooks/useDashboard.ts` handles the transformation from Edge Function responses to Dashboard format.

## Dashboard Edge Functions

### `student-dashboard`

**Endpoint:** `GET /functions/v1/student-dashboard?studentId={id}`

**Authentication:** Required (Bearer token or user session)

**Response Shape:**
```typescript
{
  assignments: Array<{
    id: string;
    title: string;
    course_id?: string;
    due_at?: string;
    status?: string; // "not_started" | "in_progress" | "completed"
    progress_pct?: number; // 0-100
    score?: number;
    completed_at?: string; // ISO date string
  }>;
  performance: {
    recentScore: number; // 0-100
    streakDays: number;
    xp: number;
  };
  recommendedCourses: Array<{
    courseId: string;
    reason: string;
    createdAt: string; // ISO date string
  }>;
}
```

**Transformation:** Maps to `StudentDashboard` interface:
- `assignments` → `upcoming` and `recent` arrays
- `performance.xp` → `stats.totalPoints`
- `performance.streakDays` → `stats.currentStreak` and `stats.bestStreak`
- `performance.recentScore` → `stats.accuracyRate`

**Location:** `supabase/functions/student-dashboard/index.ts`

---

### `get-dashboard`

**Endpoint:** `GET /functions/v1/get-dashboard?teacherId={id}`

**Authentication:** Required (Bearer token or user session)

**Used By:** Teacher, School, and Admin dashboards

**Response Shape:**
```typescript
{
  role: "teacher";
  stats: {
    sessions: number; // Total game sessions
    rounds: number; // Total game rounds
    attempts7d: number; // Attempts in last 7 days
    lastPlayedAt: string | null; // ISO date string or null
    lastFinalScore: number | null; // Final score or null
  };
}
```

**Transformation:** 
- **For Teacher Dashboard:** Maps to `TeacherDashboard` interface:
  - `stats.sessions` → `stats.activeClasses` (placeholder, needs separate fetch)
  - `stats.rounds` → `stats.assignmentsActive`
  - Other stats set to 0 or empty arrays (need separate Edge Functions)
  
- **For Admin Dashboard:** Maps to `AdminDashboard` interface:
  - All stats set to 0 or empty (needs admin-specific Edge Function)
  - `systemHealth` set to default values
  - `performance` set to empty arrays

**Note:** This Edge Function returns minimal data. Full dashboard data requires additional Edge Functions for classes, students, assignments, etc.

**Location:** `supabase/functions/get-dashboard/index.ts`

---

### `parent-dashboard`

**Endpoint:** `GET /functions/v1/parent-dashboard?parentId={id}`

**Authentication:** Required (Bearer token or user session)

**Response Shape:**
```typescript
{
  parentId: string;
  parentName?: string; // Optional parent display name
  children: Array<{
    studentId: string;
    studentName: string;
    linkStatus: string;
    linkedAt: string; // ISO date string
    metrics: {
      streakDays: number;
      xpTotal: number;
      lastLoginAt?: string | null; // ISO date string or null
      recentActivityCount: number;
    };
    upcomingAssignments: {
      count: number;
      items: Array<{
        id: string;
        title: string;
        courseId?: string;
        dueAt?: string; // ISO date string
        status?: string; // "not_started" | "in_progress" | "completed"
        progressPct?: number; // 0-100
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

**Transformation:** Maps to `ParentDashboard` interface:
- `summary.totalChildren` → `stats.children`
- `children[].upcomingAssignments.items` → `upcoming` array (flattened)
- `children[].upcomingAssignments.items` (completed) → `recent` array (flattened)
- `children[].metrics.streakDays` → `children[].currentStreak`
- `summary` → `stats` (with some fields set to 0, needs additional data)

**Location:** `supabase/functions/parent-dashboard/index.ts`

---

## Expected Dashboard Interface Shapes

### StudentDashboard
```typescript
{
  role: "student";
  userId: string;
  displayName: string;
  stats: {
    coursesInProgress: number;
    coursesCompleted: number;
    totalPoints: number;
    currentStreak: number;
    bestStreak: number;
    accuracyRate: number;
  };
  upcoming: Array<{
    id: string;
    title: string;
    type: string;
    dueDate: string;
    progress: number;
  }>;
  recent: Array<{
    id: string;
    title: string;
    type: string;
    completedAt: string;
    score: number;
  }>;
  achievements: Array<...>;
}
```

### TeacherDashboard
```typescript
{
  role: "teacher";
  userId: string;
  displayName: string;
  stats: {
    activeClasses: number;
    totalStudents: number;
    assignmentsActive: number;
    avgClassProgress: number;
    studentsNeedingHelp: number;
    coursesAssigned: number;
  };
  upcoming: Array<TeacherUpcomingItem>;
  recent: Array<TeacherRecentItem>;
  alerts: Array<Alert>;
  classes: Array<ClassInfo>;
}
```

### ParentDashboard
```typescript
{
  role: "parent";
  userId: string;
  displayName: string;
  stats: {
    children: number;
    totalCoursesActive: number;
    totalCoursesCompleted: number;
    avgAccuracy: number;
    weeklyMinutes: number;
    monthlyProgress: number;
  };
  children: Array<ChildInfo>;
  upcoming: Array<ParentUpcomingItem>;
  recent: Array<ParentRecentItem>;
  recommendations: Array<Recommendation>;
}
```

### AdminDashboard
```typescript
{
  role: "admin";
  userId: string;
  displayName: string;
  stats: {
    totalSchools: number;
    totalStudents: number;
    totalTeachers: number;
    activeClasses: number;
    coursesPublished: number;
    avgSystemProgress: number;
    activeLicenses: number;
    licenseUsage: number;
  };
  upcoming: Array<AdminUpcomingItem>;
  recent: Array<AdminRecentItem>;
  systemHealth: SystemHealth;
  performance: AdminPerformance;
  alerts: Array<Alert>;
}
```

---

## Transformation Notes

1. **Data Completeness:** Some Edge Functions return minimal data. The transformation layer sets missing fields to 0 or empty arrays. To populate these fields, additional Edge Functions or database queries are needed.

2. **Type Safety:** All transformations are type-checked against the Dashboard interfaces defined in `src/lib/types/dashboard.ts`.

3. **Error Handling:** If an Edge Function response doesn't match the expected shape, the transformation will still create a valid Dashboard object with default values, but a console warning may be logged.

4. **Future Improvements:**
   - Create admin-specific Edge Function for admin dashboard data
   - Add Edge Functions for teacher classes, students, and assignments
   - Add Edge Functions for parent recommendations and detailed child metrics
   - Add response shape validation with Zod schemas

---

## Testing

Integration tests verify that Edge Function responses can be transformed correctly:
- `tests/integration/hooks/useDashboard.integration.test.ts` - Tests transformation logic for all roles

E2E tests verify that dashboards load and display data:
- `tests/e2e/dashboard-loading.spec.ts` - Tests actual UI rendering with real API calls

