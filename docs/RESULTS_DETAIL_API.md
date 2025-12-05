# Results Detail API

## Overview

The Results Detail API provides comprehensive data about a specific game round, including detailed question-by-question breakdown, performance statistics, topic analysis, and shareable results.

## Base URL

```
/functions/v1/results-detail
```

## Authentication

- **Required**: Yes (Bearer token) OR valid share token
- **Public Access**: Supported via share token parameter

---

## Endpoint: GET /results-detail

Retrieve detailed results for a specific round.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `roundId` | uuid | Yes | The unique identifier for the round |
| `token` | string | No | Share token for public access (alternative to authentication) |

### Response Schema

```typescript
{
  round: {
    id: string;
    courseId: string;
    assignmentId?: string;
    level: number;
    contentVersion: string;
    startedAt: string;
    endedAt: string;
    elapsedSeconds: number;
    finalScore: number;
    baseScore: number;
    mistakes: number;
    distinctItems: number;
  };
  stats: {
    totalQuestions: number;
    correctAnswers: number;
    wrongAnswers: number;
    scorePct: number;
    maxStreak: number;
    avgTimePerQuestion: number;
    byTopic: {
      [topic: string]: {
        total: number;
        correct: number;
        wrong: number;
      };
    };
    byDifficulty: {
      [difficulty: string]: {
        total: number;
        correct: number;
        wrong: number;
      };
    };
  };
  questions: Array<{
    id: string;
    roundId: string;
    attemptId?: string;
    questionId: number;
    prompt: string;
    options: any[];
    correctOption: number;
    studentChoice?: number;
    isCorrect: boolean;
    explanation?: string;
    topic?: string;
    difficulty?: string;
    createdAt: string;
  }>;
  attempts: Array<{
    id: string;
    roundId: string;
    itemId: number;
    itemKey: string;
    selectedIndex: number;
    correct: boolean;
    latencyMs: number;
    createdAt: string;
  }>;
  isShared: boolean;
}
```

### Access Control

1. **Students**: Can view their own rounds
2. **Parents**: Can view their children's rounds
3. **Teachers**: Can view rounds from students in their organization
4. **Admins**: Can view all rounds
5. **Public**: Can view rounds with valid share token

---

## Database Tables

### round_questions

Stores detailed question data for each round.

```sql
CREATE TABLE public.round_questions (
  id uuid PRIMARY KEY,
  round_id uuid REFERENCES game_rounds(id),
  attempt_id uuid REFERENCES game_attempts(id),
  question_id integer NOT NULL,
  prompt text NOT NULL,
  options jsonb NOT NULL,
  correct_option integer NOT NULL,
  student_choice integer,
  is_correct boolean NOT NULL,
  explanation text,
  topic text,
  difficulty text,
  created_at timestamp with time zone NOT NULL
);
```

### round_attempts (View)

Combines game_rounds with session data for easy querying.

```sql
CREATE VIEW public.round_attempts AS
SELECT 
  r.id as round_id,
  s.user_id as student_id,
  s.course_id,
  s.assignment_id,
  r.level,
  r.started_at,
  r.ended_at,
  r.final_score,
  ROUND((r.final_score::numeric / (r.final_score + r.mistakes)) * 100, 2) as score_pct
FROM game_rounds r
JOIN game_sessions s ON s.id = r.session_id;
```

### Share Token Fields

Added to `game_rounds` table:

- `share_token` (text, unique): Token for public access
- `share_enabled` (boolean): Whether sharing is enabled
- `share_expires_at` (timestamp): Optional expiration date

---

## Examples

### Example 1: Authenticated Request

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/results-detail?roundId=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "round": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "courseId": "math-basics",
    "assignmentId": null,
    "level": 5,
    "contentVersion": "v1.2",
    "startedAt": "2025-10-31T10:00:00Z",
    "endedAt": "2025-10-31T10:15:30Z",
    "elapsedSeconds": 930,
    "finalScore": 18,
    "baseScore": 18,
    "mistakes": 2,
    "distinctItems": 20
  },
  "stats": {
    "totalQuestions": 20,
    "correctAnswers": 18,
    "wrongAnswers": 2,
    "scorePct": 90,
    "maxStreak": 12,
    "avgTimePerQuestion": 2450,
    "byTopic": {
      "Addition": { "total": 8, "correct": 7, "wrong": 1 },
      "Subtraction": { "total": 7, "correct": 7, "wrong": 0 },
      "Multiplication": { "total": 5, "correct": 4, "wrong": 1 }
    },
    "byDifficulty": {
      "Easy": { "total": 10, "correct": 10, "wrong": 0 },
      "Medium": { "total": 7, "correct": 6, "wrong": 1 },
      "Hard": { "total": 3, "correct": 2, "wrong": 1 }
    }
  },
  "questions": [
    {
      "id": "q1-uuid",
      "roundId": "123e4567-e89b-12d3-a456-426614174000",
      "questionId": 1,
      "prompt": "What is 5 + 3?",
      "options": [6, 7, 8, 9],
      "correctOption": 2,
      "studentChoice": 2,
      "isCorrect": true,
      "explanation": "5 plus 3 equals 8",
      "topic": "Addition",
      "difficulty": "Easy",
      "createdAt": "2025-10-31T10:00:05Z"
    }
  ],
  "attempts": [
    {
      "id": "a1-uuid",
      "roundId": "123e4567-e89b-12d3-a456-426614174000",
      "itemId": 101,
      "itemKey": "101:cluster1:v1",
      "selectedIndex": 2,
      "correct": true,
      "latencyMs": 2450,
      "createdAt": "2025-10-31T10:00:05Z"
    }
  ],
  "isShared": false
}
```

### Example 2: Public Access with Share Token

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/results-detail?roundId=123e4567-e89b-12d3-a456-426614174000&token=abc123xyz"
```

**Response:** (Same structure as above, with `isShared: true`)

---

## Shareable Results

### Generating a Share Token

To enable sharing, update the `game_rounds` record:

```typescript
const shareToken = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

await supabase
  .from('game_rounds')
  .update({
    share_token: shareToken,
    share_enabled: true,
    share_expires_at: expiresAt.toISOString()
  })
  .eq('id', roundId);

const shareableUrl = `${window.location.origin}/results/${roundId}?token=${shareToken}`;
```

### Revoking Share Access

```typescript
await supabase
  .from('game_rounds')
  .update({
    share_enabled: false
  })
  .eq('id', roundId);
```

---

## React Hook Example

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UseResultsDetailOptions {
  roundId: string;
  shareToken?: string;
}

export function useResultsDetail({ roundId, shareToken }: UseResultsDetailOptions) {
  return useQuery({
    queryKey: ['results-detail', roundId, shareToken],
    queryFn: async () => {
const params = new URLSearchParams({ roundId });
      if (shareToken) params.append('token', shareToken);

      const { data, error } = await supabase.functions.invoke(
        `results-detail?${params.toString()}`,
        { method: 'GET' }
      );

      if (error) throw error;
      return data;
    },
    enabled: !!roundId,
  });
}

// Usage in component
function ResultsPage({ roundId, token }: { roundId: string; token?: string }) {
  const { data, isLoading, error } = useResultsDetail({ roundId, shareToken: token });

  if (isLoading) return <div>Loading results...</div>;
  if (error) return <div>Error loading results</div>;

  return (
    <div>
      <h1>Round Results</h1>
      <div>Score: {data.stats.scorePct}%</div>
      <div>Correct: {data.stats.correctAnswers}/{data.stats.totalQuestions}</div>
      <div>Max Streak: {data.stats.maxStreak}</div>
      
      <h2>Questions</h2>
      {data.questions.map(q => (
        <div key={q.id}>
          <p>{q.prompt}</p>
          <p>Your answer: {q.studentChoice} - {q.isCorrect ? '✓' : '✗'}</p>
          {q.explanation && <p>Explanation: {q.explanation}</p>}
        </div>
      ))}
    </div>
  );
}
```

---

## Error Responses

### Missing roundId

```json
{
  "error": {
    "code": "invalid_request",
    "message": "roundId parameter is required"
  },
  "requestId": "...",
  "timestamp": "2025-10-31T10:00:00Z"
}
```

### Invalid Share Token

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid or expired share token"
  },
  "requestId": "...",
  "timestamp": "2025-10-31T10:00:00Z"
}
```

### Round Not Found

```json
{
  "error": {
    "code": "not_found",
    "message": "Round not found"
  },
  "requestId": "...",
  "timestamp": "2025-10-31T10:00:00Z"
}
```

---

## Notes

1. **Question Storage**: When a round is created, you should populate the `round_questions` table with the actual questions shown to the student. This enables detailed analysis.

2. **Performance**: The endpoint fetches multiple related tables. For production, consider adding pagination for rounds with many questions.

3. **Share Token Security**: Share tokens are randomly generated UUIDs. They do not expose user credentials but should still be treated as sensitive.

4. **Expiration**: Share tokens can optionally expire. Set `share_expires_at` to null for permanent sharing.

5. **RLS**: All queries respect row-level security. Public access is only granted with valid share tokens.

## Related APIs

- [Play Session API](./PLAY_SESSION_API.md) - Session management
- [Parent Insights API](./PARENT_INSIGHTS_API.md) - Parent dashboards
- [API Tests](./API_TESTS.md) - Testing guide
