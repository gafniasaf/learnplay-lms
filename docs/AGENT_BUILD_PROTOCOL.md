# 🤖 Agent Build Protocol

> **PRIORITY ZERO:** Read this ENTIRE document before writing ANY code.

This document ensures AI agents build the LearnPlay system correctly by following the IgniteZero methodology. Bypassing this protocol will result in inconsistent, untested code that doesn't match the plan.

---

## 🚫 ANTI-PATTERNS (NEVER DO THESE)

### ❌ DO NOT manually write page components from scratch
```typescript
// WRONG - Bypasses the Factory
export default function PlaySession() {
  // Custom implementation written from scratch...
}
```

### ❌ DO NOT regenerate existing implementations
The following files are BATTLE-TESTED and must be used AS-IS:
- `src/store/gameState.ts` - Adaptive game engine (47+ tests)
- `src/lib/gameLogic.ts` - Variant resolution algorithm
- `src/hooks/useMCP.ts` - MCP/Edge data layer
- `src/lib/types/course.ts` - Course type definitions

### ❌ DO NOT skip verification checkpoints
Every phase has a verification step. If it fails, FIX THE CODE. Never proceed with failures.

### ❌ DO NOT add features not in PLAN.md
If it's not in the plan, don't build it. Update the plan first if needed.

---

## 🆕 Repo Extensions You Must Preserve (Teacherbuddy Port Phases)

Some functionality was intentionally added outside the mockup-compiler flow as admin utilities and port scaffolding. New agents MUST NOT delete or “refactor away” these without replacing them with an equivalent generated solution.

### Library Courses (Imported / Non‑playable)

- **Why**: Imported library formats (e.g. `mes`) must not enter the playable course catalog/Play flow.
- **Key behavior**:
  - `supabase/functions/list-courses` + `supabase/functions/search-courses` support optional `?format=` filtering (via `course_metadata.tags.__format`).
  - `src/hooks/useMCP.ts` `getCourseCatalog()` requests `format=practice` by default.
- **Admin routes (hand-authored pages)**:
  - `/admin/library-courses` → `src/pages/admin/LibraryCourses.tsx`
  - `/admin/library-courses/:courseId` → `src/pages/admin/LibraryCourseDetail.tsx`

### Lesson Kit Pipeline (Ported Shared Module)

- **Shared module location**: `supabase/functions/_shared/lesson-kit/*`
- **Fail-loud policy**: No silent fallback kits on LLM failure. Missing provider must raise a clear `BLOCKED` error.
- **Strategy wiring rule**: For complex jobs, create a manual strategy file at `supabase/functions/ai-job-runner/strategies/<jobId>.ts` to override generated `gen-*.ts` stubs. Do NOT hand-edit `registry.ts` (it is generated).

## ✅ CORRECT BUILD SEQUENCE

### Phase 1: Verify Prerequisites
```bash
# Check manifest exists
cat system-manifest.json | head -20

# Check plan exists
cat PLAN.md | head -50

# Check existing implementations
ls src/store/gameState.ts
ls src/lib/gameLogic.ts
```

**Checkpoint:** All files exist. If not, STOP and ask the user.

---

### Phase 2: Generate Contracts
```bash
npx tsx scripts/scaffold-manifest.ts
```

**Checkpoint:** `src/lib/contracts.ts` is updated. Run:
```bash
npm run typecheck
```
Must pass before proceeding.

---

### Phase 3: Compile Mockups
```bash
node scripts/compile-learnplay.cjs
```

**Checkpoint:** 
- `src/pages/generated/pages/` contains 32 .tsx files
- `src/routes.generated.tsx` exists

---

### Phase 4: Wire Scaffolds to Existing Stores

This is the ONLY manual implementation step. For each page that needs real functionality:

#### 4.1 Identify the store/hook needed
| Page | Store/Hook to Import |
|------|---------------------|
| play-welcome.tsx | `useGameStateStore`, `useMCP` |
| play-session.tsx | `useGameStateStore` |
| play-results.tsx | `useGameStateStore`, `useMCP` |
| student-dashboard.tsx | `useMCP` |
| catalog-builder-media.tsx | `useMCP` |

#### 4.2 ENHANCE the scaffold (don't rewrite)
```typescript
// CORRECT - Add imports to existing scaffold
import { useGameStateStore } from "@/store/gameState";
import { useMCP } from "@/hooks/useMCP";

export default function PlaySession() {
  // Keep the scaffold's JSX structure
  // Add store connection:
  const gameStore = useGameStateStore();
  const { currentItem, processAnswer, advanceToNext } = gameStore;
  
  // Wire the existing data-cta-id handlers to store actions
  // ...rest of scaffold code...
}
```

#### 4.3 What to wire for each page type

**Play pages (welcome, session, results):**
```typescript
import { useGameStateStore } from "@/store/gameState";

// In component:
const { 
  course, currentItem, score, mistakes, 
  isComplete, initialize, processAnswer, advanceToNext 
} = useGameStateStore();
```

**Dashboard pages (student, teacher, parent):**
```typescript
import { useMCP } from "@/hooks/useMCP";

// In component:
const mcp = useMCP();

useEffect(() => {
  async function loadData() {
    const result = await mcp.listRecords('entity-slug', 20);
    // set state from result
  }
  loadData();
}, []);
```

**Editor pages (catalog-builder, teacher-control):**
```typescript
import { useMCP } from "@/hooks/useMCP";

// For AI jobs:
const handleGenerate = async () => {
  await mcp.enqueueJob('job-type', { ...payload });
};

// For save:
const handleSave = async () => {
  await mcp.saveRecord('entity-slug', { ...formData });
};
```

**Checkpoint:** After wiring each page, run:
```bash
npm run typecheck
```
Must pass before proceeding to next page.

---

### Phase 5: Full Verification
```bash
npm run verify
```

**This runs:**
1. Contract check
2. TypeScript compilation
3. Unit tests
4. Mock coverage validation
5. CTA coverage check

**All must pass.** If any fail, fix the code and re-run.

---

### Phase 6: Test User Journeys

Manually verify each journey from PLAN.md Section C:

#### Journey 1: Learner Play Loop
1. Navigate to `/student/dashboard`
2. Click "Continue Learning" → should go to `/play/welcome`
3. Select level, click "Start" → should go to `/play`
4. Answer question → should show feedback
5. Complete all items → should go to `/results`
6. Verify score/XP displayed

#### Journey 2: Teacher Assignment
1. Navigate to `/teacher/dashboard`
2. Click "Create Assignment" → should go to `/teacher/control`
3. Fill form, click "AI Draft" → should enqueue job
4. Click "Save" → should save record

#### Journey 3: Parent Check Progress
1. Navigate to `/parent/dashboard`
2. Verify goal progress displayed
3. Navigate to `/parent/goals`, `/parent/subjects`
4. Verify data loads

---

## 📁 File Reference

### Use These (DO NOT REGENERATE):
| File | Purpose | Status |
|------|---------|--------|
| `src/store/gameState.ts` | Adaptive game engine | ✅ Complete |
| `src/lib/gameLogic.ts` | Variant resolution | ✅ Complete |
| `src/hooks/useMCP.ts` | Data layer | ✅ Complete |
| `src/lib/types/course.ts` | Type definitions | ✅ Complete |

### Generate These (via scripts):
| File | Generated By |
|------|--------------|
| `src/lib/contracts.ts` | `scaffold-manifest.ts` |
| `src/pages/generated/pages/*.tsx` | `compile-learnplay.cjs` |
| `src/routes.generated.tsx` | `compile-learnplay.cjs` |

### Enhance These (add imports + wire stores):
| File | What to Add |
|------|-------------|
| `play-welcome.tsx` | Import gameState, call initialize() |
| `play-session.tsx` | Import gameState, wire processAnswer/advanceToNext |
| `play-results.tsx` | Import gameState, display score/mistakes |
| `student-dashboard.tsx` | Import useMCP, fetch assignments |
| `catalog-builder-media.tsx` | Import useMCP, wire enqueueJob/saveRecord |

---

## 🔑 Key Principles

1. **Plan is source of truth** - Everything built must trace to PLAN.md
2. **Scaffold, don't rewrite** - Enhance compiled pages, don't replace them
3. **Verify constantly** - Run typecheck after every change
4. **Use existing code** - The game engine works, don't reinvent it
5. **Test journeys** - A page isn't done until its journey works end-to-end

---

## ⚠️ If Something Goes Wrong

1. **Typecheck fails:** Read the error, fix the specific file
2. **Journey doesn't work:** Check the wiring in that page
3. **Data doesn't load:** Check entity slug matches manifest
4. **AI job fails:** Check AGENT_TOKEN and API keys are set

**Never bypass verification.** Fix the issue, don't skip the check.

---

## 📋 Completion Checklist

Before declaring the system complete:

- [ ] `npm run verify` passes
- [ ] All 32 pages compile without errors
- [ ] Learner play loop journey works
- [ ] Teacher assignment journey works
- [ ] Parent dashboard journey works
- [ ] Admin console accessible
- [ ] Game engine scores correctly
- [ ] Variant rotation works on wrong answers
- [ ] Session results save to backend

---

**Document Version:** 1.0
**Created:** 2024-12-05
**Purpose:** Prevent agents from bypassing IgniteZero methodology







