# Golden Plan Creator - App Specification

> A chat-based app that guides non-technical product owners through building MVPs in Lovable, generating optimized prompts one-by-one with built-in verification.

---

## 1. Overview

### What It Does
1. User describes their app idea in chat
2. System asks clarifying questions (like a consultant)
3. System generates a sequence of Lovable prompts, each with:
   - The build prompt (what to create)
   - A verification prompt (for Lovable to self-check)
4. User copies prompts into their Lovable project one-by-one
5. At the end, optimization prompts prepare the code for Ignite Zero handoff

### Why This Exists
- Non-technical users struggle to prompt Lovable effectively
- Lovable tends to "over-create" (adds unrequested features/pages)
- Consistency across team projects
- Prepares code for production rebuild in Ignite Zero

---

## 2. User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    GOLDEN PLAN CREATOR                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Chat Interface]                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 Welcome! Describe the app you want to build.      │   │
│  │                                                       │   │
│  │ 👤 I want to build a hiring pipeline for recruiters  │   │
│  │                                                       │   │
│  │ 🤖 Great! Let me ask a few questions:                │   │
│  │    1. Who are the user types? (e.g., recruiter,      │   │
│  │       hiring manager, candidate)                     │   │
│  │    2. What's the main thing users create/manage?     │   │
│  │    3. What are the key actions users take?           │   │
│  │                                                       │   │
│  │ 👤 Recruiters and hiring managers. They manage       │   │
│  │    job postings and candidates. Key actions:         │   │
│  │    create job, add candidate, move through stages.   │   │
│  │                                                       │   │
│  │ 🤖 Perfect! I've created your Golden Plan.           │   │
│  │    [View Generated Prompts ▼]                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [Expandable Prompt List]                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▼ Prompt 1: Project Setup                    [Copy] │   │
│  │   Create a React + TypeScript + Vite project...     │   │
│  │   ─────────────────────────────────────────────     │   │
│  │   ▼ Verification 1                           [Copy] │   │
│  │   Review what you just created. Confirm you...      │   │
│  │                                                       │   │
│  │ ▶ Prompt 2: Authentication                   [Copy] │   │
│  │ ▶ Prompt 3: Main Entity                      [Copy] │   │
│  │ ▶ Prompt 4: Dashboard                        [Copy] │   │
│  │ ...                                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [Save Plan] [View History] [Learn More]                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Core Features

### 3.1 Chat Interface
- Full-screen chat (like ChatGPT)
- System asks clarifying questions before generating prompts
- User can refine/adjust through conversation
- Mobile responsive

### 3.2 Question Flow
System asks these questions (dynamically, based on responses):

```
1. DOMAIN
   "What does your app do in one sentence?"
   "What industry/domain is this for?"

2. USERS  
   "Who will use this app? List the user types."
   "Do users need to log in?"

3. MAIN ENTITY
   "What's the main thing users create or manage?"
   "What information does each [entity] have?"

4. ACTIONS
   "What are the 3-5 key actions users take?"
   "What happens when they complete these actions?"

5. VIEWS
   "What screens do users need?"
   "Do different user types see different things?"
```

### 3.3 Prompt Generation
Each prompt includes:
- Clear instruction
- Constraints (DO NOT statements)
- Expected outcome

Example:
```
═══════════════════════════════════════════════════════════
PROMPT 3: Create Main Entity Components
═══════════════════════════════════════════════════════════

Create the Job entity with these components:
- src/components/Job/JobCard.tsx - Display card for a job posting
- src/components/Job/JobList.tsx - List of job cards with filtering
- src/components/Job/JobModal.tsx - Create/edit job modal
- src/types/job.ts - TypeScript interface for Job

The Job entity should have:
- id, title, description, department, status, created_at

CONSTRAINTS:
• DO NOT create any pages yet
• DO NOT add features not listed above
• DO NOT use custom CSS (use Tailwind only)
• DO NOT connect to Supabase yet

───────────────────────────────────────────────────────────
VERIFICATION 3: Check Your Work
───────────────────────────────────────────────────────────

Review what you just created. Confirm:
1. JobCard.tsx exists and displays title, department, status
2. JobList.tsx exists and renders multiple JobCards
3. JobModal.tsx exists with form fields for all Job properties
4. job.ts has the correct TypeScript interface

If anything is missing or different, list what needs to be fixed.
Do not add anything new.
═══════════════════════════════════════════════════════════
```

### 3.4 Prompt Sequence (Template)
Standard sequence for any MVP:

| # | Prompt Type | Purpose |
|---|-------------|---------|
| 1 | Setup | Project structure, dependencies |
| 2 | Auth | Supabase auth, user profiles |
| 3 | Main Entity | Components for primary entity |
| 4 | Child Entities | Components for secondary entities |
| 5 | Dashboard | Main view per user role |
| 6 | List Views | Entity list pages |
| 7 | Detail Views | Entity detail pages |
| 8 | Modals | Create/edit modals |
| 9 | Navigation | Routes, header, sidebar |
| 10 | Data Layer | Supabase connection, hooks |
| 11 | Error Handling | Toast notifications, loading states |
| 12 | Polish | Mobile responsive, empty states |
| 13-15 | Optimization | TypeScript cleanup, prep for handoff |

### 3.5 Optimization Prompts (End of Sequence)
Final prompts prepare code for Ignite Zero:

```
PROMPT 13: TypeScript Cleanup
Review all components and:
- Add proper TypeScript interfaces for all props
- Remove any 'any' types
- Create types/index.ts with all shared types
DO NOT add new features.

PROMPT 14: Code Cleanup
- Remove all console.log statements (except errors)
- Add JSDoc comments to exported functions
- Ensure consistent naming conventions
DO NOT change functionality.

PROMPT 15: Handoff Preparation
Create a file called HANDOFF_SPEC.md with:
- List of all entities and their fields
- List of all routes/pages
- List of all buttons/CTAs and their actions
- Any known limitations or TODOs
Use markdown format.
```

### 3.6 Copy Function
Each prompt and verification has:
- One-click copy button
- Visual feedback ("Copied!")
- Works on mobile

### 3.7 Save & History
- Save current plan with a name
- View past plans
- Resume from saved plan
- Stored in Supabase

---

## 4. Knowledge Base Content

### 4.1 What is Ignite Zero?
```
Ignite Zero is a production-quality codebase with guardrails:
- Type safety (contracts that catch errors)
- CTA coverage (every button is verified to work)
- Automated testing (no manual testing needed)
- Clean architecture (MCP proxy, manifest-driven)

Think of it as the "adult version" of your Lovable MVP.
```

### 4.2 What is a Golden Plan?
```
A Golden Plan is a step-by-step blueprint for building an MVP.

Instead of one big prompt that Lovable might misinterpret,
we break it into small, precise prompts with:
- Clear instructions
- Explicit constraints (what NOT to do)
- Verification steps

The result: a consistent, predictable MVP.
```

### 4.3 Why Build in Lovable, Then Hand Off?
```
Lovable is FAST:
- Chat → Working app in hours
- Great for testing ideas
- Non-technical friendly

But Lovable code isn't production-ready:
- May have bugs
- No test coverage
- Inconsistent patterns

Solution: Build fast in Lovable, then rebuild properly in Ignite Zero.
You get speed AND quality.
```

### 4.4 File Structure Conventions
```
Your Lovable project should have:

src/
├── components/     → Reusable UI pieces
│   └── [Entity]/   → Grouped by entity (Job/, Candidate/)
├── pages/          → Full pages/routes
│   └── [role]/     → Grouped by user role (admin/, recruiter/)
├── hooks/          → Data fetching (useJobs.ts, useCandidates.ts)
├── types/          → TypeScript interfaces
└── lib/            → Utilities

This structure makes handoff to Ignite Zero smooth.
```

### 4.5 CTA Coverage Concept
```
CTA = Call To Action (buttons, links, forms)

In Ignite Zero, every CTA is tracked:
- "Create Job" button → must work
- "Delete" button → must work
- "Submit" form → must work

If a button doesn't work, the system fails the build.

When building in Lovable:
- Make sure every button does something
- No placeholder buttons
- Test all actions manually before handoff
```

---

## 5. Technical Spec

### 5.1 Tech Stack (for Lovable)
```
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (auth + database)
- OpenAI API (for dynamic prompt generation)
```

### 5.2 Data Model

**plans table**
```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  chat_history JSONB DEFAULT '[]',
  generated_prompts JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft', -- draft, complete
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Chat history structure:**
```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
```

**Generated prompt structure:**
```typescript
interface GeneratedPrompt {
  number: number;
  title: string;
  buildPrompt: string;
  verificationPrompt: string;
  category: 'setup' | 'auth' | 'entity' | 'ui' | 'data' | 'optimization';
}
```

### 5.3 OpenAI Integration
System prompt for the LLM:
```
You are a Golden Plan Creator that helps non-technical product owners 
build MVPs in Lovable.

Your job:
1. Ask clarifying questions about their app idea
2. Generate a sequence of Lovable prompts

Each prompt must include:
- Clear, specific instructions
- CONSTRAINTS section with:
  • DO NOT create extra pages
  • DO NOT add features not mentioned
  • DO NOT use custom CSS (Tailwind only)
- Expected outcome

After each build prompt, generate a verification prompt that asks 
Lovable to self-check its work without adding anything new.

Keep prompts simple and focused. One thing at a time.
```

### 5.4 Routes
```
/                 → Landing (what is this app)
/chat             → Main chat interface
/plans            → Saved plans list
/plans/:id        → View/continue specific plan
/learn            → Knowledge base articles
/learn/ignite-zero
/learn/golden-plan
/learn/file-structure
/learn/cta-coverage
```

---

## 6. UI Components Needed

### 6.1 Chat Components
- `ChatContainer` - Main chat area
- `ChatMessage` - Single message bubble
- `ChatInput` - Text input with send button
- `TypingIndicator` - "..." animation

### 6.2 Prompt Display
- `PromptList` - Expandable list of all prompts
- `PromptCard` - Single prompt with copy button
- `VerificationCard` - Verification prompt (visually distinct)
- `CopyButton` - One-click copy with feedback

### 6.3 Navigation
- `Header` - Logo, nav links
- `MobileMenu` - Hamburger menu for mobile
- `Sidebar` - (desktop) Knowledge base links

### 6.4 Plan Management
- `PlanCard` - Saved plan in list
- `SavePlanModal` - Name and save current plan

---

## 7. Prompts to Build This App in Lovable

Here's the sequence to build the Golden Plan Creator itself:

### Prompt 1: Project Setup
```
Create a React + TypeScript + Vite project with Tailwind CSS and shadcn/ui.
Set up the project structure:
- src/components/
- src/pages/
- src/hooks/
- src/types/
- src/lib/

DO NOT create any pages yet.
DO NOT add any features.
DO NOT use custom CSS.
```

### Prompt 2: Supabase Auth
```
Add Supabase integration:
- Create src/integrations/supabase/client.ts
- Create src/hooks/useAuth.ts with login, logout, user state
- Create src/pages/Auth.tsx with email/password login
- Create src/components/ProtectedRoute.tsx

DO NOT create other pages.
DO NOT add signup flow yet.
```

### Prompt 3: Landing Page
```
Create src/pages/Landing.tsx:
- Hero section explaining what the app does
- "Get Started" button linking to /chat
- Brief explanation cards: "What is a Golden Plan?", "Why use this?"
- Clean, minimal design

DO NOT create other pages.
DO NOT add navigation yet.
```

### Prompt 4: Chat Interface
```
Create chat components:
- src/components/Chat/ChatContainer.tsx - Main chat wrapper
- src/components/Chat/ChatMessage.tsx - Message bubble (user vs assistant)
- src/components/Chat/ChatInput.tsx - Input with send button
- src/components/Chat/TypingIndicator.tsx - Loading dots

Use shadcn/ui components. Make it mobile responsive.

DO NOT add AI integration yet.
DO NOT create prompt display yet.
```

### Prompt 5: Chat Page
```
Create src/pages/Chat.tsx:
- Full-screen chat interface using ChatContainer
- Local state for messages array
- Mock responses for now (no AI)
- Scrolls to bottom on new message

DO NOT add AI yet.
DO NOT add prompt generation yet.
```

### Prompt 6: Prompt Display Components
```
Create prompt display components:
- src/components/Prompts/PromptList.tsx - Expandable accordion of prompts
- src/components/Prompts/PromptCard.tsx - Single prompt with title, content
- src/components/Prompts/CopyButton.tsx - Button that copies text, shows "Copied!"

Each PromptCard should have:
- Title (e.g., "Prompt 1: Setup")
- Build prompt content
- Verification prompt content (visually distinct, maybe different background)
- Copy button for each

DO NOT connect to AI yet.
```

### Prompt 7: OpenAI Integration
```
Create AI integration:
- src/lib/openai.ts - OpenAI client setup
- src/hooks/useChat.ts - Hook that manages chat state and calls OpenAI

The hook should:
- Send user message + system prompt to OpenAI
- Stream responses if possible
- Parse responses into prompts when generation is complete
- Use VITE_OPENAI_API_KEY from environment

DO NOT change UI components.
```

### Prompt 8: Connect Chat to AI
```
Update src/pages/Chat.tsx to:
- Use useChat hook instead of mock data
- Show TypingIndicator while waiting for response
- Parse AI responses and display generated prompts in PromptList
- Add "Generate Prompts" button that triggers final generation

DO NOT add plan saving yet.
```

### Prompt 9: Plan Data Model
```
Create Supabase tables:
- plans table with: id, user_id, name, description, chat_history, generated_prompts, status, created_at, updated_at
- Enable RLS: users can only access their own plans

Create:
- src/types/plan.ts with Plan, ChatMessage, GeneratedPrompt interfaces
- src/hooks/usePlans.ts with create, read, update, delete operations

DO NOT update UI yet.
```

### Prompt 10: Save Plan Feature
```
Add plan saving:
- src/components/Plans/SavePlanModal.tsx - Modal to name and save plan
- Add "Save Plan" button to Chat page
- Save current chat history and generated prompts

When saving:
- Create new plan with name, chat_history, generated_prompts
- Show success toast
- Update URL to /plans/:id

DO NOT create plans list page yet.
```

### Prompt 11: Plans List Page
```
Create src/pages/Plans.tsx:
- List of saved plans with name, date, status
- Click to continue/view plan
- Delete plan option
- Empty state if no plans

Create src/components/Plans/PlanCard.tsx for the list items.

DO NOT change chat functionality.
```

### Prompt 12: Knowledge Base Pages
```
Create knowledge base pages:
- src/pages/Learn.tsx - Index with links to articles
- src/pages/learn/IgniteZero.tsx - What is Ignite Zero
- src/pages/learn/GoldenPlan.tsx - What is a Golden Plan
- src/pages/learn/FileStructure.tsx - File structure conventions
- src/pages/learn/CTACoverage.tsx - CTA coverage concept

Keep content simple and scannable. Use headings, short paragraphs.

DO NOT use complex layouts.
```

### Prompt 13: Navigation
```
Add navigation:
- src/components/Layout/Header.tsx - Logo, links to /chat, /plans, /learn
- src/components/Layout/MobileMenu.tsx - Hamburger menu for mobile
- Update all pages to use consistent header

DO NOT change page content.
```

### Prompt 14: Polish & Mobile
```
Review all pages for:
- Mobile responsiveness (test at 375px width)
- Consistent spacing and typography
- Loading states where needed
- Error states with helpful messages

DO NOT add new features.
```

### Prompt 15: Cleanup & Handoff Prep
```
Final cleanup:
- Add TypeScript types to all components (no 'any')
- Remove console.log statements
- Add JSDoc comments to hooks
- Create HANDOFF_SPEC.md documenting entities, routes, CTAs

DO NOT change functionality.
```

---

## 8. System Prompt for Golden Plan Creator

This is the system prompt to use when calling OpenAI:

```
You are a Golden Plan Creator - an expert consultant that helps non-technical 
product owners build MVPs in Lovable (an AI app builder).

## Your Role
1. Understand their app idea by asking clarifying questions
2. Generate a sequence of precise Lovable prompts
3. Each prompt builds ONE thing with explicit constraints

## Conversation Flow
Start by asking:
- "What does your app do in one sentence?"
Then ask follow-ups about:
- User types/roles
- Main entities (what users create/manage)
- Key actions/features
- Required views/pages

## Prompt Generation Rules
When generating prompts:

1. ONE THING PER PROMPT
   Bad: "Create auth and dashboard and user list"
   Good: "Create authentication with Supabase"

2. ALWAYS INCLUDE CONSTRAINTS
   Every prompt must end with:
   ---
   CONSTRAINTS:
   • DO NOT create extra pages
   • DO NOT add features not mentioned
   • DO NOT use custom CSS (Tailwind only)
   ---

3. ADD VERIFICATION PROMPT
   After each build prompt, add:
   ---
   VERIFICATION:
   Review what you created. Confirm:
   - [specific check 1]
   - [specific check 2]
   If anything is missing, list what needs fixing.
   Do not add anything new.
   ---

4. STANDARD SEQUENCE
   - Setup (structure, dependencies)
   - Auth (Supabase, user roles)
   - Main entity components
   - Dashboard per role
   - List/detail views
   - Data layer (hooks, Supabase connection)
   - Error handling, loading states
   - Optimization (TypeScript, cleanup, HANDOFF_SPEC.md)

5. KEEP IT SIMPLE
   Users are non-technical. Use plain language.
   Avoid jargon unless explained.

## Output Format
When ready to generate prompts, output them in this format:

═══════════════════════════════════════════════════════════
PROMPT [N]: [Title]
═══════════════════════════════════════════════════════════

[Clear instructions]

CONSTRAINTS:
• DO NOT create extra pages
• DO NOT add features not mentioned  
• DO NOT use custom CSS (Tailwind only)

───────────────────────────────────────────────────────────
VERIFICATION [N]: Check Your Work
───────────────────────────────────────────────────────────

Review what you created. Confirm:
- [Check 1]
- [Check 2]
- [Check 3]

If anything is missing, list what needs fixing.
Do not add anything new.
═══════════════════════════════════════════════════════════

Generate 12-15 prompts total, ending with optimization prompts.
```

---

## 9. Success Criteria

The Golden Plan Creator is successful when:

- [ ] Non-technical users can describe an idea and get usable prompts
- [ ] Generated prompts produce consistent, predictable results in Lovable
- [ ] Lovable doesn't over-create when using generated prompts
- [ ] Users understand why this workflow exists (knowledge base)
- [ ] Plans can be saved and resumed
- [ ] Works well on mobile
- [ ] Final optimization prompts prepare code for Ignite Zero handoff

---

**End of Specification**


