# 🎯 Feature Parity Checklist: dawn-react-starter → LearnPlay

## Overview

| Category | dawn-react-starter | LearnPlay (current) | Gap |
|----------|-------------------|---------------------|-----|
| **React Pages** | ~50 | 69 | ✅ Complete |
| **Edge Functions** | ~100 specialized | 7 generic CRUD | ✅ By design |
| **Zustand Stores** | 2 | 0 | 🔴 Missing |
| **API Clients** | 25+ | 0 | 🔴 Missing |
| **Type Definitions** | 10+ | 1 (contracts.ts) | 🟡 Partial |
| **Game Logic** | Full adaptive | None | 🔴 Missing |
| **Utility Libraries** | 20+ | 3 | 🔴 Missing |

---

## 🔴 Missing: Client-Side Game Engine

The gameplay `/play` page needs client-side state management.

### Files to Copy

```powershell
# Zustand stores
Copy-Item "dawn-react-starter\src\store\gameState.ts" "src\store\" -Force
Copy-Item "dawn-react-starter\src\store\sessionStore.ts" "src\store\" -Force

# Game logic
Copy-Item "dawn-react-starter\src\lib\gameLogic.ts" "src\lib\" -Force
Copy-Item "dawn-react-starter\src\lib\levels.ts" "src\lib\" -Force

# Type definitions
Copy-Item "dawn-react-starter\src\lib\types\course.ts" "src\lib\types\" -Force
Copy-Item "dawn-react-starter\src\lib\types\exerciseItem.ts" "src\lib\types\" -Force
```

### What These Provide

| File | Purpose |
|------|---------|
| `gameState.ts` | Pool management, scoring, variant rotation |
| `sessionStore.ts` | Round tracking, attempt logging |
| `gameLogic.ts` | `resolveOnWrong()`, `nextVariant()` |
| `levels.ts` | Level definitions, group filtering |
| `types/course.ts` | Course, CourseItem, Level types |

---

## 🔴 Missing: API Client Layer

Dawn-react-starter has `src/lib/api/*.ts` with typed functions for each feature.

### Critical API Clients

| File | Purpose | Calls |
|------|---------|-------|
| `game.ts` | Game rounds, attempts | `game-start-round`, `game-log-attempt` |
| `course.ts` | Course CRUD | `get-course`, `save-course` |
| `catalog.ts` | Course catalog | `list-courses`, `update-catalog` |
| `analytics.ts` | Dashboards | `get-analytics`, `export-analytics` |
| `assignments.ts` | Assignments | `create-assignment`, `list-assignments` |
| `classes.ts` | Class management | `create-class`, `list-classes` |
| `messaging.ts` | Messages | `send-message`, `list-messages` |
| `parentDashboard.ts` | Parent view | `parent-dashboard`, `parent-children` |
| `studentGoals.ts` | Student goals | `student-goals`, `student-achievements` |

### Ignite Zero Alternative

The MCP approach uses generic CRUD. To maintain this pattern, we need **adapter functions**:

```typescript
// src/lib/api/game.ts (Ignite Zero style)
import { useMCP } from '@/hooks/useMCP';

export function useGameAPI() {
  const mcp = useMCP();
  
  return {
    startRound: (assignmentId: string, level: number) => 
      mcp.saveRecord('session-event', { 
        assignment_id: assignmentId, 
        outcome: 'started' 
      }),
    
    logAttempt: (data: AttemptData) => 
      mcp.saveRecord('session-event', {
        assignment_id: data.assignmentId,
        question_ref: data.itemId,
        outcome: data.isCorrect ? 'correct' : 'incorrect',
        duration_seconds: data.latencyMs / 1000,
      }),
  };
}
```

---

## 🔴 Missing: Dashboard Aggregations

Dawn-react-starter Edge Functions compute aggregations:
- `student-dashboard` → KPIs, progress
- `parent-dashboard` → Child insights
- `teacher-dashboard` → Class overview
- `get-analytics` → Charts data

### Options

**Option A: Copy Edge Functions**
```powershell
Copy-Item "dawn-react-starter\supabase\functions\student-dashboard" "supabase\functions\" -Recurse
Copy-Item "dawn-react-starter\supabase\functions\parent-dashboard" "supabase\functions\" -Recurse
```

**Option B: Client-Side Aggregation**
Compute aggregations in React from generic CRUD data:
```typescript
// Compute dashboard KPIs from raw data
const kpis = useMemo(() => ({
  totalAssignments: assignments.length,
  completedToday: assignments.filter(a => 
    a.status === 'graded' && isToday(a.updated_at)
  ).length,
  averageScore: sessionEvents.reduce((sum, e) => 
    sum + (e.outcome === 'correct' ? 1 : 0), 0
  ) / sessionEvents.length,
}), [assignments, sessionEvents]);
```

**Option C: Add New AI Job**
Create `dashboard_aggregation` job strategy that computes KPIs.

---

## 🟡 Missing: Utility Libraries

| Library | Purpose | Priority |
|---------|---------|----------|
| `tts.ts` | Text-to-speech | 🟡 Medium |
| `offlineQueue.ts` | Offline support | 🟢 Low |
| `sentry.ts` | Error tracking | 🟢 Low (already in project) |
| `sanitize.ts` | HTML sanitization | 🟡 Medium |
| `imageOptimizer.ts` | Image loading | 🟢 Low |
| `mediaFit.ts` | Media sizing | 🟡 Medium |

---

## 🟡 Missing: Type Definitions

| Type File | Purpose |
|-----------|---------|
| `types/course.ts` | Course, CourseItem, Level, MediaAttachment |
| `types/api.ts` | API response shapes |
| `types/dashboard.ts` | Dashboard KPI shapes |
| `types/exerciseItem.ts` | Game item types |
| `types/chat.ts` | Chat message types |

---

## ✅ Already Complete

| Feature | Status |
|---------|--------|
| 69 React pages | ✅ |
| Generic CRUD | ✅ |
| Job queue | ✅ |
| AI strategies | ✅ |
| MCP proxy | ✅ |
| Entity contracts | ✅ |
| Multi-tenant isolation | ✅ |
| Hybrid auth | ✅ |

---

## 📋 Implementation Plan

### Phase 1: Game Engine (Critical for `/play`)

```powershell
# 1. Create directories
New-Item -ItemType Directory -Path "src\store" -Force
New-Item -ItemType Directory -Path "src\lib\types" -Force

# 2. Copy core files
Copy-Item "dawn-react-starter\src\store\gameState.ts" "src\store\"
Copy-Item "dawn-react-starter\src\store\sessionStore.ts" "src\store\"
Copy-Item "dawn-react-starter\src\lib\gameLogic.ts" "src\lib\"
Copy-Item "dawn-react-starter\src\lib\levels.ts" "src\lib\"
Copy-Item "dawn-react-starter\src\lib\types\course.ts" "src\lib\types\"

# 3. Install zustand if not present
npm install zustand
```

### Phase 2: API Adapters

Create MCP-compatible API wrappers in `src/lib/api/`:
- `game.ts` - Game session management
- `dashboard.ts` - Dashboard data fetching
- `messaging.ts` - Message operations

### Phase 3: Dashboard Aggregations

Either:
- Copy specialized Edge Functions, OR
- Build client-side aggregation hooks

### Phase 4: Media & TTS

Copy media handling utilities if audio/video features needed.

---

## 🎯 Quick Win: Minimal Viable Gameplay

To get `/play` working with basic functionality:

1. Copy `gameState.ts` + `gameLogic.ts`
2. Create simple course type
3. Wire Play page to Zustand store
4. Log events via `mcp.saveRecord('session-event', {...})`

This gives you:
- ✅ Question presentation
- ✅ Answer checking
- ✅ Scoring
- ✅ Level progression
- ✅ Event logging

Without needing:
- ❌ Specialized Edge Functions
- ❌ Complex session management
- ❌ Full API client layer

---

## Summary

| To achieve | Effort | Files |
|-----------|--------|-------|
| **Basic gameplay** | ~2 hours | 5 files |
| **Full dashboards** | ~4 hours | 10 files |
| **Complete parity** | ~1-2 days | 30+ files |

**Recommendation:** Start with Phase 1 (game engine) to get `/play` working, then add dashboard aggregations as needed.



