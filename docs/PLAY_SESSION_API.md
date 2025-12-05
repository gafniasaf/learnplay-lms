# Play Session & Assignment Validation API

## Overview

This API provides play session recovery and assignment validation features, allowing students to save and resume their game progress, and verify assignment access rights.

---

## Play Session API

### Endpoints

#### 1. Start New Session
```
POST /functions/v1/play-session
```

Creates a new play session for a course or assignment.

**Authentication**: Required

**Request Body**:
```typescript
{
  courseId: string;
  assignmentId?: string | null;
  initialState?: Record<string, any>;
}
```

**Response**:
```typescript
{
  session: {
    id: string;
    courseId: string;
    assignmentId: string | null;
    state: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Example Request**:
```bash
curl -X POST "https://grffepyrmjihphldyfha.supabase.co/functions/v1/play-session" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": "math_grade4_fractions",
    "assignmentId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "initialState": {
      "currentLevel": 1,
      "score": 0,
      "lives": 3
    }
  }'
```

---

#### 2. Resume Session
```
GET /functions/v1/play-session?sessionId=<uuid>
```

Retrieves an existing play session to resume gameplay.

**Authentication**: Required

**Query Parameters**:
- `sessionId` (required): UUID of the session to resume

**Response**:
```typescript
{
  session: {
    id: string;
    courseId: string;
    assignmentId: string | null;
    state: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Example Request**:
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/play-session?sessionId=12345678-abcd-ef12-3456-7890abcdef12" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### 3. Save Session State
```
PATCH /functions/v1/play-session?sessionId=<uuid>
```

Updates the state of an existing play session.

**Authentication**: Required

**Query Parameters**:
- `sessionId` (required): UUID of the session to update

**Request Body**:
```typescript
{
  state: Record<string, any>;
}
```

**Response**:
```typescript
{
  session: {
    id: string;
    courseId: string;
    assignmentId: string | null;
    state: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Example Request**:
```bash
curl -X PATCH "https://grffepyrmjihphldyfha.supabase.co/functions/v1/play-session?sessionId=12345678-abcd-ef12-3456-7890abcdef12" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "currentLevel": 3,
      "score": 450,
      "lives": 2,
      "itemsCompleted": [1, 2, 3, 4, 5],
      "lastCheckpoint": "2025-01-31T15:30:00Z"
    }
  }'
```

---

## Assignment Metadata API

### Endpoint
```
GET /functions/v1/assignment-metadata?assignmentId=<uuid>
```

Retrieves assignment metadata including title, due date, and user's access rights.

**Authentication**: Required

**Query Parameters**:
- `assignmentId` (required): UUID of the assignment

**Response Schema**:
```typescript
{
  metadata: {
    id: string;
    title: string;
    courseId: string;
    dueAt: string | null;
    createdAt: string;
    organization: {
      id: string;
      name: string;
    };
    status: {
      isOverdue: boolean;
      daysRemaining: number | null;
    };
    accessRights: {
      canView: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canSubmit: boolean;
      role: 'teacher' | 'student' | 'viewer';
    };
    studentProgress: {
      status: string;
      progress_pct: number;
      score: number | null;
    } | null;
    assigneeCount: number | null; // Only for teachers
  }
}
```

**Example Request**:
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/assignment-metadata?assignmentId=a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Sample Response (Student)**:
```json
{
  "metadata": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Fractions Practice",
    "courseId": "math_grade4_fractions",
    "dueAt": "2025-02-15T23:59:59Z",
    "createdAt": "2025-01-15T10:00:00Z",
    "organization": {
      "id": "org-uuid",
      "name": "Lincoln Elementary School"
    },
    "status": {
      "isOverdue": false,
      "daysRemaining": 15
    },
    "accessRights": {
      "canView": true,
      "canEdit": false,
      "canDelete": false,
      "canSubmit": true,
      "role": "student"
    },
    "studentProgress": {
      "status": "in_progress",
      "progress_pct": 60,
      "score": null
    },
    "assigneeCount": null
  }
}
```

**Sample Response (Teacher)**:
```json
{
  "metadata": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Fractions Practice",
    "courseId": "math_grade4_fractions",
    "dueAt": "2025-02-15T23:59:59Z",
    "createdAt": "2025-01-15T10:00:00Z",
    "organization": {
      "id": "org-uuid",
      "name": "Lincoln Elementary School"
    },
    "status": {
      "isOverdue": false,
      "daysRemaining": 15
    },
    "accessRights": {
      "canView": true,
      "canEdit": true,
      "canDelete": true,
      "canSubmit": false,
      "role": "teacher"
    },
    "studentProgress": null,
    "assigneeCount": 25
  }
}
```

---

## JavaScript Examples

### Play Session Management

```typescript
import { supabase } from '@/integrations/supabase/client';

// Start a new session
async function startPlaySession(courseId: string, assignmentId?: string) {
  const { data, error } = await supabase.functions.invoke('play-session', {
    method: 'POST',
    body: {
      courseId,
      assignmentId,
      initialState: {
        currentLevel: 1,
        score: 0,
        lives: 3,
        startedAt: new Date().toISOString()
      }
    }
  });

  if (error) {
    console.error('Failed to start session:', error);
    return null;
  }

  // Store session ID in local storage for recovery
  localStorage.setItem('currentSessionId', data.session.id);
  return data.session;
}

// Resume existing session
async function resumePlaySession(sessionId: string) {
const { data, error } = await supabase.functions.invoke(
    `play-session?sessionId=${sessionId}`,
    { method: 'GET' }
  );

  if (error) {
    console.error('Failed to resume session:', error);
    return null;
  }

  return data.session;
}

// Save session state
async function savePlaySession(sessionId: string, state: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke(
    `play-session?sessionId=${sessionId}`,
    {
      method: 'PATCH',
      body: { state }
    }
  );

  if (error) {
    console.error('Failed to save session:', error);
    return false;
  }

  return true;
}

// Auto-save implementation
let autoSaveInterval: NodeJS.Timeout | null = null;

function startAutoSave(sessionId: string, getState: () => Record<string, any>) {
  // Save every 30 seconds
  autoSaveInterval = setInterval(() => {
    const currentState = getState();
    savePlaySession(sessionId, currentState);
  }, 30000);
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}
```

### Session Recovery Flow

```typescript
// On game component mount
async function initializeGame(courseId: string, assignmentId?: string) {
  // Check if there's a session to resume
  const savedSessionId = localStorage.getItem('currentSessionId');
  
  if (savedSessionId) {
    try {
      const session = await resumePlaySession(savedSessionId);
      if (session && session.courseId === courseId) {
        // Ask user if they want to resume
        const shouldResume = confirm('Resume your previous session?');
        
        if (shouldResume) {
          // Load saved state
          return {
            sessionId: session.id,
            state: session.state,
            isResume: true
          };
        }
      }
    } catch (error) {
      console.log('Could not resume session, starting new one');
    }
  }
  
  // Start new session
  const session = await startPlaySession(courseId, assignmentId);
  return {
    sessionId: session.id,
    state: session.state,
    isResume: false
  };
}
```

### Assignment Validation

```typescript
// Check assignment access before starting
async function validateAssignment(assignmentId: string) {
const { data, error } = await supabase.functions.invoke(
    `assignment-metadata?assignmentId=${assignmentId}`,
    { method: 'GET' }
  );

  if (error) {
    throw new Error('Failed to validate assignment');
  }

  const { metadata } = data;

  // Check if user can access
  if (!metadata.accessRights.canView) {
    throw new Error('Access denied to this assignment');
  }

  // Check if overdue (warn but don't block)
  if (metadata.status.isOverdue) {
    console.warn('This assignment is overdue');
  }

  // Check if can submit
  if (!metadata.accessRights.canSubmit) {
    console.warn('You cannot submit this assignment');
  }

  return metadata;
}
```

---

## React Hooks

### usePlaySession Hook

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PlaySessionState {
  sessionId: string | null;
  gameState: Record<string, any>;
  isLoading: boolean;
  error: string | null;
}

export function usePlaySession(courseId: string, assignmentId?: string) {
  const [session, setSession] = useState<PlaySessionState>({
    sessionId: null,
    gameState: {},
    isLoading: true,
    error: null
  });

  // Initialize or resume session
  useEffect(() => {
    async function init() {
      try {
        const savedSessionId = localStorage.getItem('currentSessionId');
        
        if (savedSessionId) {
          // Try to resume
const { data } = await supabase.functions.invoke(
            `play-session?sessionId=${savedSessionId}`,
            { method: 'GET' }
          );
          
          if (data?.session && data.session.courseId === courseId) {
            setSession({
              sessionId: data.session.id,
              gameState: data.session.state,
              isLoading: false,
              error: null
            });
            return;
          }
        }
        
        // Start new session
        const { data, error } = await supabase.functions.invoke('play-session', {
          method: 'POST',
          body: { courseId, assignmentId, initialState: {} }
        });
        
        if (error) throw error;
        
        localStorage.setItem('currentSessionId', data.session.id);
        setSession({
          sessionId: data.session.id,
          gameState: data.session.state,
          isLoading: false,
          error: null
        });
      } catch (err) {
        setSession({
          sessionId: null,
          gameState: {},
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to initialize session'
        });
      }
    }
    
    init();
  }, [courseId, assignmentId]);

  // Save state
  const saveState = useCallback(async (newState: Record<string, any>) => {
    if (!session.sessionId) return false;
    
    try {
      await supabase.functions.invoke(
        `play-session?sessionId=${session.sessionId}`,
        {
          method: 'PATCH',
          body: { state: newState }
        }
      );
      
      setSession(prev => ({ ...prev, gameState: newState }));
      return true;
    } catch (err) {
      console.error('Failed to save state:', err);
      return false;
    }
  }, [session.sessionId]);

  return {
    ...session,
    saveState
  };
}
```

---

## Recovery Link Implementation

### Generating Recovery Links

Recovery links allow users to continue their session from another device or after closing the browser.

**Link Format**:
```
/game/resume?sessionId=<uuid>&courseId=<course_id>
```

**Implementation**:
```typescript
// Generate recovery link
function generateRecoveryLink(sessionId: string, courseId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/game/resume?sessionId=${sessionId}&courseId=${courseId}`;
}

// Copy to clipboard
async function copyRecoveryLink(sessionId: string, courseId: string) {
  const link = generateRecoveryLink(sessionId, courseId);
  await navigator.clipboard.writeText(link);
  console.log('Recovery link copied to clipboard');
}

// Handle recovery link route
// In your router component:
function ResumeGamePage() {
  const params = useSearchParams();
  const sessionId = params.get('sessionId');
  const courseId = params.get('courseId');
  
  useEffect(() => {
    if (sessionId && courseId) {
      // Store session ID for auto-resume
      localStorage.setItem('currentSessionId', sessionId);
      // Redirect to game with resume flag
      window.location.href = `/game/${courseId}?resume=true`;
    }
  }, [sessionId, courseId]);
  
  return <div>Resuming your game...</div>;
}
```

---

## Database Schema

### play_sessions Table

```sql
CREATE TABLE public.play_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id text NOT NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_play_sessions_student_course 
  ON public.play_sessions(student_id, course_id);
CREATE INDEX idx_play_sessions_assignment 
  ON public.play_sessions(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX idx_play_sessions_updated 
  ON public.play_sessions(updated_at DESC);
```

### State Schema Example

```typescript
interface GameState {
  // Current progress
  currentLevel: number;
  currentRound: number;
  score: number;
  lives: number;
  
  // Completed items
  itemsCompleted: number[];
  levelsCompleted: number[];
  
  // Performance tracking
  correctAnswers: number;
  incorrectAnswers: number;
  averageResponseTime: number;
  
  // Checkpoints
  lastCheckpoint: string; // ISO timestamp
  checkpointData?: Record<string, any>;
  
  // Metadata
  startedAt: string;
  lastSavedAt: string;
  totalPlayTime: number; // seconds
}
```

---

## RLS Policies

```sql
-- Students view their own sessions
CREATE POLICY "students_view_own_sessions"
  ON public.play_sessions FOR SELECT
  USING (auth.uid() = student_id);

-- Students create their own sessions
CREATE POLICY "students_create_own_sessions"
  ON public.play_sessions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Students update their own sessions
CREATE POLICY "students_update_own_sessions"
  ON public.play_sessions FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Teachers view org student sessions
CREATE POLICY "teachers_view_org_sessions"
  ON public.play_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou1
      JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
      WHERE ou1.user_id = auth.uid()
        AND ou1.org_role IN ('teacher', 'school_admin')
        AND ou2.user_id = play_sessions.student_id
    )
  );
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "courseId is required"
}
```

### 401 Unauthorized
```json
{
  "error": "Missing authorization header"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied",
  "message": "You do not have permission to access this assignment"
}
```

### 404 Not Found
```json
{
  "error": "Session not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "Failed to create session"
}
```

---

## Testing Checklist

### Play Session API
- [ ] Can start new session
- [ ] Can resume existing session
- [ ] Can save session state
- [ ] Auto-save works every 30 seconds
- [ ] Recovery link generates correctly
- [ ] Recovery link resumes session
- [ ] RLS prevents access to other users' sessions
- [ ] Session linked to assignment validates access
- [ ] Old sessions can be cleaned up

### Assignment Metadata API
- [ ] Returns correct metadata for students
- [ ] Returns correct metadata for teachers
- [ ] Validates assignment access
- [ ] Calculates overdue status correctly
- [ ] Returns student progress for students
- [ ] Returns assignee count for teachers
- [ ] Handles missing assignments gracefully
- [ ] RLS policies work correctly
