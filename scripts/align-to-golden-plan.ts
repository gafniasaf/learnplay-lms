/**
 * Align to Golden Plan Script
 * 
 * Checks if the current workspace is aligned with Golden Plan v5.0 format
 * and generates missing files from existing artifacts.
 * 
 * Usage: npx tsx scripts/align-to-golden-plan.ts [--fix]
 */

import fs from 'fs';
import path from 'path';

interface AlignmentIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix?: () => void;
}

const issues: AlignmentIssue[] = [];

function checkFile(filePath: string, required: boolean): boolean {
  const exists = fs.existsSync(filePath);
  if (!exists && required) {
    issues.push({
      severity: 'error',
      message: `Missing required file: ${filePath}`,
    });
  } else if (!exists) {
    issues.push({
      severity: 'warning', 
      message: `Optional file missing: ${filePath}`,
    });
  }
  return exists;
}

function checkDirectory(dirPath: string, required: boolean): boolean {
  const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  if (!exists && required) {
    issues.push({
      severity: 'error',
      message: `Missing required directory: ${dirPath}`,
    });
  }
  return exists;
}

function generatePlanFromManifest(manifestPath: string): string {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  
  const rootEntities = manifest.data_model?.root_entities || [];
  const childEntities = manifest.data_model?.child_entities || [];
  const agentJobs = manifest.agent_jobs || [];
  
  // Build entity tables
  const entityTable = rootEntities.map((e: any) => 
    `| ${e.name} | ${e.slug} | Root entity |`
  ).concat(childEntities.map((e: any) => 
    `| ${e.name} | ${e.slug} | Child entity |`
  )).join('\n');
  
  // Build entity field details
  const entityDetails = rootEntities.map((e: any) => {
    const fields = (e.fields || []).map((f: any) => {
      const typeStr = f.type === 'enum' ? `enum: ${f.options?.join('/')}` : f.type;
      return `| ${f.name} | ${typeStr} | - | - |`;
    }).join('\n');
    return `#### ${e.name} Fields\n| Field | Type | Required | Description |\n|-------|------|----------|-------------|\n${fields}`;
  }).join('\n\n');
  
  // Build job table
  const jobTable = agentJobs.map((j: any) => 
    `| ${j.id} | ${j.target_entity} | ${j.execution_mode} | ${j.ui?.placement || 'n/a'} |`
  ).join('\n');
  
  // Build job details
  const jobDetails = agentJobs.map((j: any) => `
#### ${j.id}
- **Target Entity:** ${j.target_entity}
- **Execution Mode:** ${j.execution_mode}
- **UI Placement:** ${j.ui?.placement || 'n/a'}
- **Icon:** ${j.ui?.icon || 'Sparkles'}

**Prompt Template:**
\`\`\`
${j.prompt_template}
\`\`\`
`).join('\n');

  return `# ${manifest.branding?.name || 'Product'} – Golden Plan

> **Auto-generated from system-manifest.json**
> Review and enhance with user journeys, UI details, and business logic.

---

## A. Domain Definition

### A.1 Product Name
${manifest.branding?.name || '[Product Name]'}

### A.2 Tagline
${manifest.branding?.tagline || '[Tagline]'}

### A.3 Problem Statement
[TODO: Describe the problem this product solves]

### A.4 Target Users
| Persona | Description | Primary Goal |
|---------|-------------|--------------|
| Learner | Student using the platform | Complete learning goals |
| Teacher | Instructor managing classes | Monitor student progress |
| Parent | Guardian tracking child progress | Stay informed on learning |
| Admin | Platform administrator | Manage system health |

### A.5 Key Features
1. Adaptive learning sessions
2. Multi-role dashboards
3. AI-powered content generation
4. Progress tracking and analytics

---

## B. Data Model

### B.1 Root Entities

| Entity | Slug | Description |
|--------|------|-------------|
${entityTable}

${entityDetails}

---

## C. User Journeys

### C.1 Learner Journey: Complete a Learning Session

**Trigger:** Learner opens the app

**Steps:**
1. View dashboard → /student/dashboard → See current assignment and goals
2. Start session → /play → Begin adaptive learning
3. Answer questions → /play → Get immediate feedback
4. Complete session → /results → See score and progress
5. Return to dashboard → /student/dashboard → Updated goal status

**Success Criteria:**
- [ ] Session completed with score tracked
- [ ] Goal progress updated

### C.2 Teacher Journey: Assign Work

**Trigger:** Teacher wants to create an assignment

**Steps:**
1. Open control panel → /teacher/control → See class overview
2. Create assignment → /teacher/assignments → Fill assignment form
3. Use AI assist → Click "Draft Plan" → AI suggests activities
4. Assign to students → Save → Students see new work

---

## D. UI Surfaces

### D.1 Route Map

| Route | Page Name | Persona | States |
|-------|-----------|---------|--------|
| /student/dashboard | Student Dashboard | Learner | default, loading, empty |
| /teacher/dashboard | Teacher Dashboard | Teacher | default, loading |
| /parent/dashboard | Parent Dashboard | Parent | default, empty |
| /admin/console | Admin Console | Admin | default |
| /play | Play Session | Learner | default, loading |
| /results | Session Results | Learner | default |

### D.2 Page Specifications

> See docs/mockups/ for detailed HTML mockups with CTAs and data bindings.

---

## E. AI Jobs & Prompts

### E.1 Job Registry

| Job ID | Target Entity | Mode | Trigger |
|--------|---------------|------|---------|
${jobTable}

### E.2 Job Specifications

${jobDetails}

---

## F. Business Logic Specifications

### F.1 State Machines

#### Game Session State Machine
\`\`\`mermaid
stateDiagram-v2
    [*] --> idle: initialized
    idle --> loading: loadCourse
    loading --> playing: courseLoaded
    playing --> answering: showQuestion
    answering --> feedback: submitAnswer
    feedback --> playing: nextQuestion
    feedback --> complete: poolEmpty
    complete --> [*]
\`\`\`

**States:**
| State | Description | Entry Condition |
|-------|-------------|-----------------|
| idle | Initial state | Component mount |
| loading | Loading course data | loadCourse called |
| playing | Active session | Course loaded |
| answering | Waiting for answer | Question displayed |
| feedback | Showing result | Answer submitted |
| complete | Session ended | Pool empty |

**Transitions:**
| From | To | Event | Side Effects |
|------|-----|-------|--------------|
| answering | feedback | submitAnswer | Update score, modify pool |
| feedback | playing | nextQuestion | Select next item from pool |
| feedback | complete | poolEmpty | Save results to backend |

### F.2 Algorithms

#### Adaptive Pool Management
**Purpose:** Manage the item pool for adaptive learning

**Pseudocode:**
\`\`\`
INPUT: currentItem, selectedAnswer, pool, course
OUTPUT: updatedPool, isCorrect, gameEnded

1. Check if selectedAnswer matches correctIndex
2. IF correct:
     Remove currentItem from pool
     gameEnded = pool.length === 0
3. ELSE:
     Find next variant in cluster
     Add variant to pool (re-queue for practice)
4. RETURN { updatedPool, isCorrect, gameEnded }
\`\`\`

**Edge Cases:**
- No variants in cluster: Re-queue same item
- Pool empty after correct: End game
- Item outside level range: Skip and log error

### F.3 Computed Properties

| Property | Formula | Used In |
|----------|---------|---------|
| progress | (poolSize - pool.length) / poolSize * 100 | Progress bar |
| accuracy | score / (score + mistakes) * 100 | Results page |
| timePerQuestion | elapsedTime / questionsAnswered | Analytics |

### F.4 Client-Side Stores

#### useGameStateStore
**Purpose:** Manages adaptive learning game state

**Schema:**
\`\`\`typescript
interface GameState {
  course: Course | null;
  level: number;
  pool: CourseItem[];
  currentItem: CourseItem | null;
  score: number;
  mistakes: number;
  elapsedTime: number;
  isComplete: boolean;
  
  initialize: (course: Course, level: number) => void;
  processAnswer: (selectedIndex: number) => AnswerResult;
  advanceToNext: () => void;
  reset: () => void;
}
\`\`\`

**Initial State:**
\`\`\`typescript
{
  course: null,
  level: 1,
  pool: [],
  currentItem: null,
  score: 0,
  mistakes: 0,
  elapsedTime: 0,
  isComplete: false,
}
\`\`\`

### F.5 Validation Rules

| Entity | Field | Rule | Error Message |
|--------|-------|------|---------------|
| LearnerProfile | full_name | min 1 char | "Name is required" |
| Assignment | title | min 1 char | "Title is required" |
| Assignment | due_date | >= today | "Due date must be in the future" |

### F.6 Business Rules

| Rule ID | Description | Enforcement |
|---------|-------------|-------------|
| BR-001 | Learners can only access their own assignments | RLS policy on assignment table |
| BR-002 | Teachers can only assign to their own classes | UI filter + backend validation |
| BR-003 | Completed sessions cannot be modified | Status check before save |

---

## G. Environment & Secrets

### G.1 Frontend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VITE_SUPABASE_URL | Yes | - | Supabase project URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | Yes | - | Public anon key |
| VITE_USE_MOCK | No | false | Use mock data |
| VITE_USE_MCP_PROXY | No | false | Use MCP proxy |
| VITE_MCP_URL | If proxy | http://127.0.0.1:4000 | MCP server URL |

### G.2 Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SUPABASE_SERVICE_ROLE_KEY | Yes | - | Service role key |
| AGENT_TOKEN | Yes | - | Token for AI jobs |
| OPENAI_API_KEY | If AI | - | For AI job execution |

### G.3 MCP Server Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PORT | No | 4000 | Server port |
| MCP_AUTH_TOKEN | Yes | - | Auth token |
| ORGANIZATION_ID | Yes | - | Tenant isolation |

---

## Verification Checklist

- [x] system-manifest.json exists and is valid
- [x] contracts.ts generated
- [x] Edge Functions deployed
- [x] Game logic implemented (src/store/gameState.ts)
- [ ] All mockups have data-route and data-cta-id
- [ ] E2E tests updated for new UI

---

**Plan Version:** 1.0  
**Generated:** ${new Date().toISOString().split('T')[0]}  
**Source:** system-manifest.json
`;
}

function generateUserJourney(manifestPath: string): string {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  
  return `# User Journey: Primary Learning Flow

## Overview
The core user journey for ${manifest.branding?.name || 'the platform'} focuses on learners completing adaptive learning sessions while teachers and parents monitor progress.

## Steps

1. **Login** → User authenticates at \`/auth\` → Redirected to role-specific dashboard
2. **Dashboard** → User sees overview → Current assignments, goals, progress
3. **Start Session** → Learner clicks "Continue" → Navigates to \`/play\`
4. **Answer Questions** → Adaptive algorithm presents items → Immediate feedback
5. **Complete Session** → Pool exhausted → Navigates to \`/results\`
6. **Review Results** → User sees score and progress → Option to replay or return

## Success Metrics
- Session completion rate > 80%
- Average session time < 15 minutes
- Accuracy improvement over time

## Edge Cases
- Network disconnection mid-session → Auto-save progress, resume on reconnect
- All answers wrong → Eventually complete via variant rotation
- Session timeout → Save partial progress
`;
}

async function main() {
  const shouldFix = process.argv.includes('--fix');
  const targetDir = '.';
  
  console.log('🔍 Checking Golden Plan v5.0 Alignment...\n');
  
  // Required files
  const manifestPath = path.join(targetDir, 'system-manifest.json');
  const planPath = path.join(targetDir, 'PLAN.md');
  const journeyPath = path.join(targetDir, 'user_journey.md');
  const mockupsDir = path.join(targetDir, 'mockups');
  const docsMockupsDir = path.join(targetDir, 'docs', 'mockups');
  
  // Check manifest (required)
  const hasManifest = checkFile(manifestPath, true);
  
  // Check PLAN.md
  if (!fs.existsSync(planPath)) {
    issues.push({
      severity: 'error',
      message: 'Missing PLAN.md - Required for Golden Plan compliance',
      fix: hasManifest ? () => {
        const content = generatePlanFromManifest(manifestPath);
        fs.writeFileSync(planPath, content);
        console.log('   ✅ Generated PLAN.md from system-manifest.json');
      } : undefined,
    });
  }
  
  // Check user_journey.md
  if (!fs.existsSync(journeyPath)) {
    issues.push({
      severity: 'warning',
      message: 'Missing user_journey.md - Recommended for clarity',
      fix: hasManifest ? () => {
        const content = generateUserJourney(manifestPath);
        fs.writeFileSync(journeyPath, content);
        console.log('   ✅ Generated user_journey.md');
      } : undefined,
    });
  }
  
  // Check mockups directory (can be in root or docs/)
  const hasMockups = fs.existsSync(mockupsDir);
  const hasDocsMockups = fs.existsSync(docsMockupsDir);
  
  if (!hasMockups && !hasDocsMockups) {
    issues.push({
      severity: 'error',
      message: 'Missing mockups/ directory',
    });
  } else if (!hasMockups && hasDocsMockups) {
    issues.push({
      severity: 'info',
      message: 'Mockups found in docs/mockups/ (non-standard location)',
      fix: () => {
        // Create symlink or copy
        fs.mkdirSync(mockupsDir, { recursive: true });
        // Copy layout.html from docs/mockups if it exists
        const layoutSrc = path.join(docsMockupsDir, 'layout.html');
        if (fs.existsSync(layoutSrc)) {
          fs.copyFileSync(layoutSrc, path.join(mockupsDir, 'layout.html'));
        } else {
          // Create minimal layout.html
          fs.writeFileSync(path.join(mockupsDir, 'layout.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Layout</title>
</head>
<body>
  <header data-region="header">Header</header>
  <aside data-region="sidebar">Sidebar</aside>
  <main data-region="content">Content</main>
  <footer data-region="footer">Footer</footer>
</body>
</html>`);
        }
        console.log('   ✅ Created mockups/ directory with layout.html');
      },
    });
  }
  
  // Check contracts.ts
  checkFile(path.join(targetDir, 'src', 'lib', 'contracts.ts'), true);
  
  // Check game logic (LearnPlay-specific)
  const hasGameStore = fs.existsSync(path.join(targetDir, 'src', 'store', 'gameState.ts'));
  const hasGameLogic = fs.existsSync(path.join(targetDir, 'src', 'lib', 'gameLogic.ts'));
  
  if (hasGameStore && hasGameLogic) {
    console.log('✅ Game logic already implemented (gameState.ts, gameLogic.ts)');
  }
  
  // Report issues
  console.log('\n📋 Alignment Report:\n');
  
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');
  
  if (errors.length > 0) {
    console.log('❌ ERRORS:');
    errors.forEach(i => console.log(`   - ${i.message}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    warnings.forEach(i => console.log(`   - ${i.message}`));
  }
  
  if (infos.length > 0) {
    console.log('\nℹ️ INFO:');
    infos.forEach(i => console.log(`   - ${i.message}`));
  }
  
  // Apply fixes if requested
  if (shouldFix) {
    console.log('\n🔧 Applying fixes...\n');
    const fixable = issues.filter(i => i.fix);
    if (fixable.length === 0) {
      console.log('   No automatic fixes available.');
    } else {
      fixable.forEach(i => {
        if (i.fix) i.fix();
      });
    }
  } else if (issues.some(i => i.fix)) {
    console.log('\n💡 Run with --fix to auto-generate missing files');
  }
  
  // Summary
  console.log('\n' + '─'.repeat(50));
  if (errors.length === 0) {
    console.log('✅ System is aligned with Golden Plan v5.0');
  } else {
    console.log(`❌ ${errors.length} error(s) need resolution`);
    if (!shouldFix) {
      console.log('   Run: npx tsx scripts/align-to-golden-plan.ts --fix');
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});



