# Lovable → Ignite Zero Handoff Guide

> **Purpose**: Build MVPs in Lovable, then hand off to Ignite Zero for production-quality reconstruction with guardrails.

---

## Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    LOVABLE      │      │   HANDOFF ZIP   │      │  IGNITE ZERO    │
│                 │      │                 │      │                 │
│  Build MVP      │ ───► │  React + Docs   │ ───► │  Rebuild with   │
│  Fast & Messy   │      │  + Edge Funcs   │      │  Guardrails     │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

**What Lovable Does Well**: Rapid prototyping, quick iteration, visual feedback
**What Ignite Zero Adds**: Type safety, CTA coverage, MCP proxy, automated verification

---

## Part 1: Building in Lovable

### 1.1 Project Setup

When starting a new project in Lovable, use this initial prompt template:

```
Create a [YOUR DOMAIN] application with:

TECH STACK:
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui components
- React Router for navigation
- React Query for data fetching
- Supabase for auth and database

STRUCTURE:
- Multi-role support: [list your roles, e.g., student/teacher/admin]
- Each role has its own dashboard at /[role]/dashboard
- Shared components in /components
- Role-specific pages in /pages/[role]/

NAMING CONVENTIONS (IMPORTANT):
- Dashboard components: [Role]Dashboard.tsx
- Editor components: [Entity]Editor.tsx
- List components: [Entity]List.tsx
- Modal components: [Entity]Modal.tsx
- Hooks: use[Entity].ts

DATA MODEL:
- Main entity: [e.g., Course, Project, Candidate]
- Child entities: [e.g., Task, Item, Module]
- Users have roles stored in user_profiles table
- All tables have organization_id for multi-tenancy
```

### 1.2 Required Patterns in Lovable

**Tell Lovable to follow these patterns:**

#### A. File Structure
```
src/
├── components/           # Reusable UI components
│   ├── ui/              # shadcn components
│   └── [Entity]/        # Entity-specific components
├── pages/               # Route pages
│   ├── [role]/          # Role-specific pages
│   └── Index.tsx        # Landing/portal
├── hooks/               # Custom hooks
├── lib/                 # Utilities
│   ├── supabase.ts      # Supabase client
│   └── utils.ts         # Helpers
├── types/               # TypeScript types
└── integrations/        # External integrations
    └── supabase/
        └── client.ts
```

#### B. Supabase Integration
Prompt Lovable:
```
Use Supabase with this pattern:
- Create a typed Supabase client in src/integrations/supabase/client.ts
- Store JSON content in Supabase Storage at: [entity]/{id}.json
- Store metadata in PostgreSQL tables
- Enable Row Level Security (RLS) on all tables
- Use organization_id for data isolation
```

#### C. Edge Functions (if needed)
Prompt Lovable:
```
Create Supabase Edge Functions for:
- [function-name]: [description]

Each edge function should:
- Be in supabase/functions/[function-name]/index.ts
- Use Deno and esm.sh imports
- Handle CORS with proper headers
- Return JSON responses
- Log errors to console
```

### 1.3 Building the MVP

**Iterate in phases:**

#### Phase 1: Core UI (Day 1-2)
- [ ] Landing page with role selection
- [ ] Auth flow (login/signup)
- [ ] Main dashboard for each role
- [ ] Navigation between sections

#### Phase 2: Data & CRUD (Day 2-3)
- [ ] Connect to Supabase
- [ ] Create/read/update/delete for main entities
- [ ] List views with filtering
- [ ] Detail/edit views

#### Phase 3: Features (Day 3-5)
- [ ] Role-specific features
- [ ] Modals and forms
- [ ] Search and filtering
- [ ] Basic analytics/reporting

#### Phase 4: Polish (Day 5-7)
- [ ] Error handling
- [ ] Loading states
- [ ] Empty states
- [ ] Mobile responsiveness

### 1.4 Quality Checklist Before Export

Before exporting from Lovable, verify:

```
[ ] AUTH
    [ ] Login works
    [ ] Logout works
    [ ] Role detection works
    [ ] Protected routes redirect to login

[ ] DATA
    [ ] Create entity works
    [ ] Read entity works
    [ ] Update entity works
    [ ] Delete entity works
    [ ] Data persists after refresh

[ ] UI/UX
    [ ] All buttons have clear labels
    [ ] All modals have Cancel/Confirm
    [ ] Loading states show spinners
    [ ] Error states show messages
    [ ] Empty states show helpful text

[ ] NAVIGATION
    [ ] All links work
    [ ] Back navigation works
    [ ] Role switching works (if applicable)

[ ] NO BROKEN CODE
    [ ] No console errors on happy path
    [ ] No TypeScript errors visible
    [ ] No missing imports
```

---

## Part 2: Creating the Handoff Package

### 2.1 Technical Specification Document

Create a file called `HANDOFF_SPEC.md` in your Lovable project with this template:

```markdown
# Technical Specification: [Project Name]

## 1. Domain Overview
**What this app does**: [One paragraph description]

**Target users**: [Who uses this app]

**Core workflow**: [Main user journey in 3-5 steps]

## 2. Entity Model

### Root Entity: [Name]
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| title | string | Display name |
| content | json | Main content blob |
| organization_id | uuid | Tenant isolation |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last modified |

### Child Entity: [Name]
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| parent_id | uuid | FK to root entity |
| ... | ... | ... |

## 3. User Roles

| Role | Access Level | Key Features |
|------|--------------|--------------|
| [role1] | [level] | [what they can do] |
| [role2] | [level] | [what they can do] |

## 4. Routes & Pages

| Route | Component | Purpose | Role Access |
|-------|-----------|---------|-------------|
| / | Landing | Portal selection | public |
| /auth | Auth | Login/signup | public |
| /[role]/dashboard | [Role]Dashboard | Main view | [role] |
| /[role]/[entity] | [Entity]List | List view | [role] |
| /[role]/[entity]/:id | [Entity]Detail | Detail view | [role] |

## 5. Critical CTAs (Calls to Action)

| Page | Button Text | Action | Priority |
|------|-------------|--------|----------|
| Dashboard | "Create New" | Opens create modal | HIGH |
| Dashboard | "View Details" | Navigates to detail | HIGH |
| Editor | "Save" | Saves to Supabase | HIGH |
| Editor | "Cancel" | Closes without saving | MEDIUM |
| List | "Delete" | Removes item | MEDIUM |

## 6. Supabase Tables

### Table: [table_name]
```sql
CREATE TABLE [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... fields
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON [table_name]
  USING (organization_id = auth.jwt() ->> 'organization_id');
```

## 7. Edge Functions

### Function: [function-name]
- **Purpose**: [What it does]
- **Endpoint**: POST /functions/v1/[function-name]
- **Input**: `{ field1: string, field2: number }`
- **Output**: `{ result: any, success: boolean }`
- **Errors**: [List possible error codes]

## 8. Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| VITE_SUPABASE_URL | Supabase project URL | https://xxx.supabase.co |
| VITE_SUPABASE_ANON_KEY | Public anon key | eyJ... |

## 9. Known Limitations / TODOs

- [ ] [Thing that doesn't work yet]
- [ ] [Feature that needs improvement]
- [ ] [Technical debt to address]

## 10. Screenshots

[Include screenshots of key screens]
- Landing page
- Main dashboard (each role)
- Key modals
- Mobile view
```

### 2.2 Export from Lovable

**Option A: GitHub Export (Recommended)**
1. In Lovable: Settings → GitHub Integration
2. Connect to a new repository
3. Export all code
4. Clone repo locally
5. Add `HANDOFF_SPEC.md` to the repo
6. Create zip: `git archive -o handoff.zip HEAD`

**Option B: Direct Download**
1. In Lovable: Use Code Mode to see files
2. Download/copy each folder:
   - `src/` - All React code
   - `supabase/` - Edge functions and config
   - `public/` - Static assets
3. Create `HANDOFF_SPEC.md`
4. Zip everything together

### 2.3 Handoff Package Structure

Your zip file should contain:

```
handoff-[project-name]/
├── HANDOFF_SPEC.md          # Technical specification
├── README.md                 # Lovable's generated readme
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config
├── tailwind.config.ts        # Tailwind config
├── src/
│   ├── components/          # React components
│   ├── pages/               # Route pages
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # Utilities
│   ├── types/               # TypeScript types
│   ├── integrations/        # Supabase client
│   ├── App.tsx              # Root component
│   └── main.tsx             # Entry point
├── supabase/
│   ├── functions/           # Edge functions
│   │   └── [function-name]/
│   │       └── index.ts
│   └── config.toml          # Supabase config
└── public/                   # Static assets
```

---

## Part 3: Handoff Instructions for Cursor Agent

Include this prompt with your zip file:

```markdown
# Ignite Zero Reconstruction Task

## Context
I'm handing off a Lovable MVP to be rebuilt in the Ignite Zero system.

## Files Provided
- `handoff-[project-name].zip` - Complete Lovable export
- `HANDOFF_SPEC.md` - Technical specification document

## Your Task
1. **Read** `HANDOFF_SPEC.md` first to understand the domain
2. **Read** `docs/AI_CONTEXT.md` in Ignite Zero for architecture rules
3. **Update** `system-manifest.json` with entities from HANDOFF_SPEC
4. **Run** `npx tsx scripts/scaffold-manifest.ts` to generate contracts
5. **Copy** Lovable's React components to `src/`
6. **Fix** TypeScript errors to match Ignite Zero contracts
7. **Export** mock HTMLs: `npx tsx scripts/export-mocks.ts`
8. **Update** `coverage.json` with CTAs from HANDOFF_SPEC
9. **Run** `npm run verify` until all checks pass
10. **Wire** MCP hooks where needed (replace direct Supabase calls)

## Key Mappings
From HANDOFF_SPEC.md, map:
- Root Entity → `data_model[type="root_entity"]` in manifest
- Child Entity → `data_model[type="child_entity"]` in manifest
- Roles → `user_roles` in manifest
- Edge Functions → `supabase/functions/` (keep or adapt)

## Success Criteria
- [ ] `npm run typecheck` passes
- [ ] `npm run verify` passes
- [ ] All routes from HANDOFF_SPEC render
- [ ] All critical CTAs from HANDOFF_SPEC work
- [ ] Mock mode works without Supabase connection
```

---

## Part 4: Lovable Prompting Cheat Sheet

### Starting Prompts

**For a Dashboard App:**
```
Build a [domain] management dashboard with React, TypeScript, Tailwind, 
and Supabase. Include role-based access for [roles]. The main entity is 
[entity] with fields: [fields]. Users should be able to create, view, 
edit, and delete [entities] from their dashboard.
```

**For a Workflow App:**
```
Build a [domain] workflow app where users can [action]. The workflow has
stages: [stage1] → [stage2] → [stage3]. Each stage has different actions.
Use Supabase for persistence and real-time updates.
```

**For a Content Platform:**
```
Build a [domain] content platform with an editor for creating [content type].
Include a viewer for consuming content, progress tracking, and [specific feature].
Content should be stored as JSON in Supabase Storage.
```

### Refinement Prompts

**Fix Structure:**
```
Reorganize the code to follow this structure:
- src/pages/[role]/ for role-specific pages
- src/components/[Entity]/ for entity-specific components
- src/hooks/use[Entity].ts for data hooks
```

**Add TypeScript:**
```
Add proper TypeScript types for all components. Create a types/ folder
with interfaces for [Entity], [Entity]Props, and API responses.
```

**Improve Error Handling:**
```
Add error handling to all Supabase calls. Show toast notifications for
errors. Add loading states to all async operations.
```

**Add Mock Data:**
```
Create a mock data layer that works without Supabase. Add a useMock flag
in localStorage that switches between real and mock data.
```

### Export Preparation Prompts

**Before Export:**
```
Review the codebase and:
1. Remove any console.log statements except for errors
2. Ensure all components have proper TypeScript types
3. Add JSDoc comments to all exported functions
4. Create a HANDOFF_SPEC.md with the template I'll provide
```

---

## Part 5: Common Patterns to Request in Lovable

### Authentication Pattern
```
Implement auth with Supabase:
- src/hooks/useAuth.ts - Auth state and methods
- src/components/ProtectedRoute.tsx - Route guard
- src/pages/Auth.tsx - Login/signup form
- Store user role in user_profiles table
- Redirect to role-specific dashboard after login
```

### CRUD Pattern
```
Implement CRUD for [Entity]:
- src/hooks/use[Entity].ts - React Query hooks
- src/components/[Entity]List.tsx - List view with filters
- src/components/[Entity]Card.tsx - Card display
- src/components/[Entity]Modal.tsx - Create/edit modal
- src/components/[Entity]Detail.tsx - Full detail view
```

### Multi-Role Pattern
```
Implement multi-role access:
- Detect role from user_profiles after login
- Redirect to /[role]/dashboard
- Show role-specific navigation
- Guard routes by role
- Share components between roles where appropriate
```

### Modal Pattern
```
All modals should:
- Have a clear title
- Have Cancel and Confirm buttons
- Show loading state on submit
- Close on successful action
- Show error toast on failure
- Be dismissible with Escape key
```

---

## Quick Reference Card

### Lovable Build Checklist
```
□ Tech stack: React + TS + Vite + Tailwind + shadcn + Supabase
□ File structure follows conventions
□ Multi-role support implemented
□ Auth flow complete
□ CRUD operations work
□ Error handling in place
□ Loading/empty states exist
□ No console errors
□ HANDOFF_SPEC.md created
```

### Handoff Package Checklist
```
□ All src/ files included
□ supabase/functions/ included
□ package.json included
□ HANDOFF_SPEC.md complete with:
  □ Entity model
  □ Routes table
  □ CTAs table
  □ Supabase schema
  □ Known limitations
```

### Agent Instructions Checklist
```
□ Read HANDOFF_SPEC first
□ Read AI_CONTEXT.md
□ Update system-manifest.json
□ Run scaffold-manifest.ts
□ Copy React components
□ Fix TypeScript errors
□ Export mock HTMLs
□ Update coverage.json
□ Run npm run verify
□ Wire MCP hooks
```

---

## Contact & Support

If you have questions about this workflow:
1. Check `docs/AI_CONTEXT.md` for Ignite Zero rules
2. Check `docs/EDGE_DEPLOYMENT_RUNBOOK.md` for Edge function issues
3. Run `npm run verify` to diagnose problems

The goal is: **Fast MVP in Lovable → Clean handoff → Production-quality Ignite Zero rebuild**

