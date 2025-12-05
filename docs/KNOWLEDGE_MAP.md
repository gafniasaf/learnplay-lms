# Knowledge Map System

**Status:** Implemented (Mock Mode)  
**Migration:** `20250111_knowledge_map_schema.sql`  
**API:** `src/lib/api/knowledgeMap.ts`

---

## Overview

The Knowledge Map system provides skill-level learning tracking and targeted assignments based on Knowledge Objectives (KOs). It enables students, teachers, and parents to track mastery at a granular skill level beyond course completion.

### Key Features

- **Skill-Level Mastery Tracking** - Track student progress on individual knowledge objectives
- **Domain-Based Organization** - Skills organized by domain (math, reading, science) and topics
- **Smart Assignments** - Teachers and parents can assign specific skills to students
- **AI Recommendations** - AI-suggested course recommendations based on skill gaps
- **Autonomous Assignments** - Configurable auto-assignment when mastery falls below threshold
- **Class Analytics** - Teachers can see class-wide skill summaries and struggling students

---

## Architecture

### Core Entities

#### 1. **Knowledge Objectives (KOs)**
Individual skills or concepts students must master.

```typescript
interface KnowledgeObjective {
  id: string;
  name: string;              // e.g., "Two-step linear equations"
  description: string;       // Detailed explanation
  domain: string;            // "math", "reading", "science"
  topicClusterId: string;    // e.g., "math.algebra"
  difficulty: number;        // 0-1 scale
  prerequisites: string[];   // Array of prerequisite KO IDs
  examples: Array<{          // Example problems
    problem: string;
    solution: string;
  }>;
}
```

**Database:** `knowledge_objectives` table

#### 2. **Mastery State**
Tracks student progress on each KO.

```typescript
interface MasteryState {
  studentId: string;
  koId: string;
  mastery: number;          // 0-1 scale (0.5 = starting point)
  evidenceCount: number;    // Number of exercises completed
  status: 'locked' | 'in-progress' | 'mastered';
  lastPracticed: string;    // ISO timestamp
  firstPracticed: string;   // ISO timestamp
}
```

**Database:** `mastery_state` table

**Status Logic:**
- `locked`: Prerequisites not yet met (mastery < 0.3)
- `in-progress`: Active learning (0.3 ≤ mastery < 0.75)
- `mastered`: Skill achieved (mastery ≥ 0.75)

#### 3. **Assignments**
Skill-specific assignments from teachers, parents, or AI.

```typescript
interface Assignment {
  id: string;
  studentId: string;
  koId: string;
  courseId: string;
  assignedBy: string;       // User ID
  assignedByRole: 'teacher' | 'parent' | 'ai_autonomous';
  status: 'active' | 'completed' | 'overdue' | 'cancelled';
  completionCriteria: {
    primaryKpi: 'mastery_score' | 'exercise_count';
    targetMastery?: number;   // e.g., 0.75
    minEvidence?: number;     // Minimum exercises
  };
  llmRationale?: string;      // AI explanation
  llmConfidence?: number;     // 0-1 confidence score
  dueDate?: string;
}
```

**Database:** `ko_assignments` table

---

## API Functions

All functions are in `src/lib/api/knowledgeMap.ts` and support mock/live mode switching.

### Student Skills

#### `getStudentSkills(params)`
Fetch student's skills with filtering and pagination.

```typescript
const result = await getStudentSkills({
  studentId: 'student-123',
  domain: 'math',           // Optional filter
  status: 'in-progress',    // Optional: 'all' | 'locked' | 'in-progress' | 'mastered'
  searchQuery: 'algebra',   // Optional search
  limit: 50,
  offset: 0
});

// Returns:
{
  skills: MasteryStateWithKO[],  // Skills with embedded KO data
  totalCount: number
}
```

#### `getDomainGrowth(params)`
Get domain-level mastery summary for parent dashboard.

```typescript
const domains = await getDomainGrowth({
  studentId: 'student-123'
});

// Returns: DomainGrowthSummary[]
[
  {
    domain: 'math',
    overallMastery: 0.68,
    trend: 0.05,           // Growth rate
    masteredCount: 12,
    inProgressCount: 8,
    lockedCount: 3
  },
  // ... other domains
]
```

### Teacher Analytics

#### `getClassKOSummary(params)`
Get class-wide skill analytics for teachers.

```typescript
const summary = await getClassKOSummary({
  teacherId: 'teacher-456',
  classId: 'class-1',      // Optional
  sortBy: 'struggling',    // 'struggling' | 'mastery' | 'name'
  sortOrder: 'desc',
  limit: 20
});

// Returns: ClassKOSummary[]
[
  {
    classId: 'class-1',
    className: "Mrs. Johnson's Class",
    koId: 'ko-123',
    koName: 'Two-step linear equations',
    domain: 'math',
    totalStudents: 25,
    strugglingCount: 8,    // Students with mastery < 0.5
    avgMastery: 0.62,
    lastPracticed: '2025-01-10T14:30:00Z',
    status: 'urgent' | 'opportunity' | 'strong'
  }
]
```

### Recommendations

#### `getRecommendedCourses(params)`
Get AI-recommended courses for a specific skill.

```typescript
const courses = await getRecommendedCourses({
  koId: 'ko-123',
  studentId: 'student-123',
  limit: 10
});

// Returns: RecommendedCourse[]
[
  {
    courseId: 'course-456',
    title: 'Algebra Foundations',
    relevance: 0.92,
    estimatedTime: 45,     // minutes
    exerciseCount: 12
  }
]
```

#### `getAIRecommendation(params)`
Get AI-powered course recommendation with rationale.

```typescript
const recommendation = await getAIRecommendation({
  studentId: 'student-123',
  koId: 'ko-123',
  availableCourseIds: ['course-1', 'course-2', 'course-3']
});

// Returns: AIRecommendationResult
{
  recommendedCourseId: 'course-2',
  estimatedSessions: 5,
  estimatedMinutes: 75,
  confidence: 0.87,
  rationale: 'This course has the highest relevance score...'
}
```

### Assignments

#### `createAssignment(params)`
Create a new skill assignment.

```typescript
const result = await createAssignment({
  studentIds: ['student-123', 'student-456'],
  koId: 'ko-123',
  courseId: 'course-789',
  assignedBy: 'teacher-1',
  assignedByRole: 'teacher',
  completionCriteria: {
    primaryKpi: 'mastery_score',
    targetMastery: 0.75,
    minEvidence: 5
  },
  llmRationale: 'AI suggests this course for struggling students',
  llmConfidence: 0.85
});

// Returns: { assignmentIds: string[], success: boolean }
```

#### `getStudentAssignments(params)`
Fetch student's active/completed assignments.

```typescript
const assignments = await getStudentAssignments({
  studentId: 'student-123',
  status: 'active',        // 'active' | 'completed' | 'overdue' | 'all'
  limit: 10
});
```

### Mastery Updates

#### `updateMastery(params)`
Update mastery score after exercise completion.

```typescript
const result = await updateMastery({
  studentId: 'student-123',
  koId: 'ko-456',
  exerciseScore: 0.8,      // 0-1 (% correct)
  weight: 1.0              // Mapping weight (default 1.0)
});

// Returns: UpdateMasteryResult
{
  oldMastery: 0.65,
  newMastery: 0.68,
  evidenceCount: 12
}
```

**Mastery Algorithm:**
- New mastery = weighted average of previous mastery and exercise score
- Evidence count increases with each update
- Mastery converges over time with more evidence

#### `checkCompletion(params)`
Check if assignment completion criteria met.

```typescript
const result = await checkCompletion({
  assignmentId: 'assign-789'
});

// Returns: CheckCompletionResult
{
  completed: true,
  reason: 'mastery_achieved',
  finalMastery: 0.76
}
```

### Auto-Assignment Settings

#### `getAutoAssignSettings(params)`
Get student's autonomous assignment configuration.

```typescript
const settings = await getAutoAssignSettings({
  studentId: 'student-123'
});

// Returns: AutoAssignSettings | null
{
  studentId: 'student-123',
  enabled: true,
  masteryThreshold: 0.55,
  frequency: 'on_completion',
  maxConcurrent: 2,
  notifyOnAssign: true,
  notifyEmail: 'parent@example.com'
}
```

#### `updateAutoAssignSettings(params)`
Update auto-assignment configuration.

```typescript
await updateAutoAssignSettings({
  studentId: 'student-123',
  settings: {
    enabled: true,
    masteryThreshold: 0.60,
    frequency: 'weekly',
    maxConcurrent: 3,
    notifyOnAssign: true,
    notifyEmail: 'parent@example.com'
  }
});
```

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `topics` | Domain organization (math.algebra, reading.comprehension) |
| `knowledge_objectives` | Core KO definitions with prerequisites |
| `mastery_state` | Student progress on each KO |
| `exercise_ko_mappings` | Maps course exercises to KOs with weights |
| `course_ko_scope` | Defines which KOs each course covers |
| `student_ko_preferences` | Assignment overrides and priorities |
| `ko_assignments` | Detailed assignment records |
| `auto_assign_settings` | Per-student autonomous assignment config |
| `ko_merge_proposals` | Deduplication queue for similar KOs |

### Key Indexes

```sql
-- Fast student lookups
CREATE INDEX idx_mastery_student ON mastery_state(student_id);

-- Low-mastery intervention queries
CREATE INDEX idx_mastery_low ON mastery_state(student_id, ko_id) 
  WHERE mastery < 0.5;

-- Exercise-to-KO mapping lookups
CREATE INDEX idx_mapping_exercise ON exercise_ko_mappings(exercise_id);

-- Prerequisite graph queries
CREATE INDEX idx_ko_prerequisites ON knowledge_objectives USING GIN(prerequisites);
```

---

## Integration with Courses

### Exercise-KO Mapping

Each course exercise can map to multiple KOs with weights:

```typescript
// Example: Course exercise maps to 2 KOs
{
  exerciseId: "course-123:item-456",
  mappings: [
    { koId: "ko-linear-equations", weight: 0.7 },
    { koId: "ko-variables", weight: 0.3 }
  ]
}
```

When student completes exercise:
1. System looks up KO mappings for that exercise
2. Calls `updateMastery()` for each mapped KO with appropriate weight
3. Updates mastery state using weighted average algorithm

### Course Recommendations

When teacher/parent needs to assign work for a skill:
1. System identifies student's KO gaps (low mastery)
2. Queries `course_ko_scope` for courses covering that KO
3. Ranks by relevance and student's current level
4. Optionally calls AI for enhanced recommendation with rationale

---

## Current Status

### ✅ Implemented

- Complete database schema with all tables
- Mock data layer for testing
- All API functions with TypeScript types
- Domain growth tracking for parents
- Class KO summary for teachers
- Assignment creation and tracking
- Auto-assignment configuration
- AI recommendation integration (mock)

### 🚧 In Progress

- Edge function implementations (currently using mocks)
- RLS policies for multi-tenant security
- Materialized views for performance

### 📋 Planned

- LLM-based KO extraction from courses
- Automated exercise-to-KO mapping
- KO merge/deduplication workflow
- Vector embeddings for semantic KO matching
- Prerequisite graph visualization
- Parent mobile notifications for auto-assignments

---

## Usage Examples

### Student View: Browse Skills

```typescript
// Get student's math skills
const { skills, totalCount } = await getStudentSkills({
  studentId: userId,
  domain: 'math',
  status: 'in-progress',
  limit: 20
});

// Display skill cards with mastery progress
skills.forEach(skill => {
  console.log(`${skill.ko.name}: ${(skill.mastery * 100).toFixed(0)}%`);
});
```

### Teacher View: Identify Struggling Students

```typescript
// Get class skills sorted by struggling count
const struggles = await getClassKOSummary({
  teacherId: userId,
  sortBy: 'struggling',
  sortOrder: 'desc',
  limit: 10
});

// Show intervention opportunities
struggles.forEach(ko => {
  if (ko.status === 'urgent') {
    console.log(`⚠️ ${ko.koName}: ${ko.strugglingCount}/${ko.totalStudents} struggling`);
  }
});
```

### Parent View: Track Domain Growth

```typescript
// Get child's domain progress
const domains = await getDomainGrowth({
  studentId: childId
});

// Display growth chart
domains.forEach(domain => {
  const trend = domain.trend > 0 ? '📈' : domain.trend < 0 ? '📉' : '➡️';
  console.log(`${domain.domain}: ${(domain.overallMastery * 100).toFixed(0)}% ${trend}`);
});
```

### AI-Assisted Assignment

```typescript
// Get AI recommendation for struggling student
const recommendation = await getAIRecommendation({
  studentId: 'student-123',
  koId: 'ko-fractions',
  availableCourseIds: courseCatalog.map(c => c.id)
});

// Create assignment with AI rationale
await createAssignment({
  studentIds: ['student-123'],
  koId: 'ko-fractions',
  courseId: recommendation.recommendedCourseId,
  assignedBy: teacherId,
  assignedByRole: 'teacher',
  completionCriteria: {
    primaryKpi: 'mastery_score',
    targetMastery: 0.75,
    minEvidence: 5
  },
  llmRationale: recommendation.rationale,
  llmConfidence: recommendation.confidence
});
```

---

## Testing

### Mock Data
The system includes comprehensive mock data for testing:
- 20+ Knowledge Objectives across math, reading, science
- Mock mastery states for multiple students
- Sample assignments with various statuses
- Domain growth data

**Enable Mock Mode:**
```typescript
// In src/lib/api/knowledgeMap.ts
const USE_MOCK_DATA = true;
```

### Edge Functions (Production)
To enable live mode:
1. Deploy edge functions to Supabase
2. Set `USE_MOCK_DATA = false` in `knowledgeMap.ts`
3. Ensure RLS policies are configured
4. Run database migration

---

## Future Enhancements

### Adaptive Learning
- Dynamic prerequisite unlocking based on mastery
- Spaced repetition scheduling for review
- Forgetting curve modeling

### Analytics
- Mastery velocity tracking (skill acquisition rate)
- Cross-skill correlation analysis
- Predictive mastery forecasting

### AI Integration
- Automated KO extraction from new courses
- Natural language skill search
- Personalized learning path generation

---

## References

- **Migration:** `supabase/migrations/20250111_knowledge_map_schema.sql`
- **API:** `src/lib/api/knowledgeMap.ts`
- **Types:** `src/lib/types/knowledgeMap.ts`
- **Mock Data:** `src/lib/mocks/knowledgeMockData.ts`
- **Components:** `src/components/student/SkillCards.tsx`, `src/components/teacher/TeacherKOTable.tsx`

---

**Last Updated:** 2025-11-13  
**Status:** Production-ready (mock mode), awaiting edge function deployment
