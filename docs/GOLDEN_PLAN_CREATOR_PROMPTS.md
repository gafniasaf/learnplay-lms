# Golden Plan Creator - Lovable Build Prompts

Copy each prompt into Lovable one at a time. Wait for completion before moving to the next.

---

## PROMPT 1: Project Setup

```
Create a React + TypeScript + Vite project with Tailwind CSS and shadcn/ui.

Set up the project structure:
- src/components/
- src/pages/
- src/hooks/
- src/types/
- src/lib/

Install these dependencies:
- @supabase/supabase-js
- openai
- lucide-react (for icons)
- react-router-dom

DO NOT create any pages yet.
DO NOT add any features.
DO NOT use custom CSS.
```

---

## PROMPT 2: Supabase Setup

```
Add Supabase integration:

1. Create src/integrations/supabase/client.ts with typed Supabase client
2. Create src/hooks/useAuth.ts with:
   - user state
   - loading state
   - login(email, password) function
   - logout() function
   - useEffect to listen for auth changes

3. Create src/pages/Auth.tsx with:
   - Email input
   - Password input
   - Login button
   - Simple centered card layout

4. Create src/components/ProtectedRoute.tsx that redirects to /auth if not logged in

Use shadcn/ui components for the form.

DO NOT create other pages.
DO NOT add signup flow.
DO NOT use custom CSS.
```

---

## PROMPT 3: Landing Page

```
Create src/pages/Landing.tsx with:

1. Hero section:
   - Title: "Golden Plan Creator"
   - Subtitle: "Build MVPs in Lovable the right way"
   - "Get Started" button linking to /chat

2. Three explanation cards below:
   - Card 1: "What is a Golden Plan?" - Brief explanation
   - Card 2: "Why use this?" - Build fast, consistent results
   - Card 3: "How it works" - Describe idea → Get prompts → Build in Lovable

3. Simple footer with "Powered by Ignite Zero"

Use a clean, minimal design with lots of whitespace.
Make it mobile responsive.

DO NOT create other pages.
DO NOT add navigation header yet.
DO NOT use custom CSS.
```

---

## PROMPT 4: Chat Components

```
Create chat UI components:

1. src/components/Chat/ChatContainer.tsx
   - Full height container for chat
   - Scrollable message area
   - Input area fixed at bottom

2. src/components/Chat/ChatMessage.tsx
   - Props: role ('user' | 'assistant'), content (string)
   - User messages: right-aligned, blue background
   - Assistant messages: left-aligned, gray background
   - Show avatar icon for each

3. src/components/Chat/ChatInput.tsx
   - Multiline textarea that grows
   - Send button (arrow icon)
   - Disabled state while sending

4. src/components/Chat/TypingIndicator.tsx
   - Three animated dots
   - Shows when assistant is "typing"

Use shadcn/ui components. Make everything mobile responsive.

DO NOT add AI integration yet.
DO NOT create pages.
DO NOT use custom CSS.
```

---

## PROMPT 5: Chat Page

```
Create src/pages/Chat.tsx:

1. Full-screen layout using ChatContainer
2. State for messages array: { role: 'user' | 'assistant', content: string }[]
3. Initial assistant message: "Welcome! Describe the app you want to build, and I'll create a Golden Plan for you."
4. When user sends message:
   - Add to messages array
   - Show TypingIndicator for 1 second
   - Add mock assistant response: "Thanks! Let me ask some questions about your app..."
5. Auto-scroll to bottom when new message added

DO NOT add real AI yet.
DO NOT add prompt generation.
DO NOT use custom CSS.
```

---

## PROMPT 6: Prompt Display Components

```
Create components to display generated prompts:

1. src/components/Prompts/PromptList.tsx
   - Accordion/expandable list of prompts
   - Props: prompts array
   - Shows prompt titles, click to expand

2. src/components/Prompts/PromptCard.tsx
   - Props: number, title, buildPrompt, verificationPrompt
   - Expandable card showing:
     - "PROMPT [N]: [Title]" header
     - Build prompt content in a code-like box
     - "VERIFICATION [N]" section with different background color
     - Copy button for build prompt
     - Copy button for verification prompt

3. src/components/Prompts/CopyButton.tsx
   - Props: text (string to copy)
   - Shows "Copy" with copy icon
   - On click: copy to clipboard, show "Copied!" for 2 seconds
   - Then revert to "Copy"

Use shadcn/ui Accordion for the list.
Use monospace font for prompt content.

DO NOT connect to AI yet.
DO NOT use custom CSS.
```

---

## PROMPT 7: Types and Interfaces

```
Create TypeScript types:

1. src/types/chat.ts
   interface ChatMessage {
     id: string;
     role: 'user' | 'assistant';
     content: string;
     timestamp: Date;
   }

2. src/types/prompt.ts
   interface GeneratedPrompt {
     number: number;
     title: string;
     buildPrompt: string;
     verificationPrompt: string;
     category: 'setup' | 'auth' | 'entity' | 'ui' | 'data' | 'optimization';
   }

3. src/types/plan.ts
   interface Plan {
     id: string;
     userId: string;
     name: string;
     description: string;
     chatHistory: ChatMessage[];
     generatedPrompts: GeneratedPrompt[];
     status: 'draft' | 'complete';
     createdAt: Date;
     updatedAt: Date;
   }

Update existing components to use these types.

DO NOT change functionality.
DO NOT use custom CSS.
```

---

## PROMPT 8: OpenAI Integration

```
Create OpenAI integration:

1. src/lib/openai.ts
   - Initialize OpenAI client using VITE_OPENAI_API_KEY
   - Export function: generateChatResponse(messages: ChatMessage[], systemPrompt: string)
   - Returns assistant message content

2. src/lib/systemPrompt.ts
   - Export the system prompt as a constant string
   - System prompt should instruct the AI to:
     - Ask clarifying questions about the user's app idea
     - Generate Lovable prompts with constraints
     - Include verification prompts after each build prompt
     - Keep prompts simple and focused

3. src/hooks/useChat.ts
   - State: messages, isLoading, generatedPrompts
   - Function: sendMessage(content) - calls OpenAI, updates messages
   - Function: generatePrompts() - triggers final prompt generation
   - Parse AI responses to extract prompts when format matches

DO NOT update UI components yet.
DO NOT use custom CSS.
```

---

## PROMPT 9: Connect Chat to AI

```
Update src/pages/Chat.tsx:

1. Replace mock logic with useChat hook
2. Show TypingIndicator when isLoading is true
3. When generatedPrompts array has items, show PromptList below the chat
4. Add a "Generate My Golden Plan" button that appears after enough conversation
   - Only show after at least 4 message exchanges
   - Calls generatePrompts() from the hook
5. Handle errors with toast notification

The flow should be:
- User describes app
- AI asks questions (3-5 exchanges)
- User clicks "Generate My Golden Plan"
- AI generates all prompts
- Prompts appear in expandable list below chat

DO NOT add plan saving yet.
DO NOT use custom CSS.
```

---

## PROMPT 10: Supabase Tables

```
Set up Supabase database:

1. Create 'plans' table with columns:
   - id (uuid, primary key, default gen_random_uuid())
   - user_id (uuid, references auth.users)
   - name (text, not null)
   - description (text)
   - chat_history (jsonb, default '[]')
   - generated_prompts (jsonb, default '[]')
   - status (text, default 'draft')
   - created_at (timestamptz, default now())
   - updated_at (timestamptz, default now())

2. Enable Row Level Security on plans table

3. Create RLS policy: users can only CRUD their own plans
   - Policy for SELECT: auth.uid() = user_id
   - Policy for INSERT: auth.uid() = user_id
   - Policy for UPDATE: auth.uid() = user_id
   - Policy for DELETE: auth.uid() = user_id

4. Create src/hooks/usePlans.ts with:
   - getPlans() - fetch user's plans
   - getPlan(id) - fetch single plan
   - createPlan(data) - create new plan
   - updatePlan(id, data) - update plan
   - deletePlan(id) - delete plan

DO NOT update UI yet.
DO NOT use custom CSS.
```

---

## PROMPT 11: Save Plan Feature

```
Add ability to save plans:

1. Create src/components/Plans/SavePlanModal.tsx
   - Input for plan name
   - Optional input for description
   - Save button
   - Cancel button
   - Uses shadcn/ui Dialog

2. Update src/pages/Chat.tsx:
   - Add "Save Plan" button in header area
   - Only show when there are generated prompts
   - Opens SavePlanModal
   - On save: create plan in Supabase, show success toast
   - After save: update URL to /plans/[newPlanId]

3. When loading /chat with no plan, start fresh
4. When loading /plans/:id, load existing plan data into chat

DO NOT create plans list page yet.
DO NOT use custom CSS.
```

---

## PROMPT 12: Plans List Page

```
Create src/pages/Plans.tsx:

1. Header: "Your Golden Plans"
2. Grid of plan cards showing:
   - Plan name
   - Description (truncated)
   - Status badge (draft/complete)
   - Created date
   - Click to open /plans/:id

3. Create src/components/Plans/PlanCard.tsx for the cards
   - Delete button (with confirmation)
   - Shows prompt count

4. Empty state when no plans:
   - "No plans yet"
   - "Create your first Golden Plan" button → /chat

5. Loading state with skeleton cards

Make it responsive: 1 column on mobile, 2 on tablet, 3 on desktop.

DO NOT use custom CSS.
```

---

## PROMPT 13: Knowledge Base Pages

```
Create knowledge base section:

1. src/pages/Learn.tsx
   - Title: "Learn"
   - Grid of article cards linking to sub-pages
   - Articles: Ignite Zero, Golden Plan, File Structure, CTA Coverage, Lovable Tips

2. src/pages/learn/IgniteZero.tsx
   - Title: "What is Ignite Zero?"
   - Simple explanation: production codebase with guardrails
   - Bullet points: type safety, CTA coverage, automated testing
   - "Think of it as the adult version of your Lovable MVP"

3. src/pages/learn/GoldenPlan.tsx
   - Title: "What is a Golden Plan?"
   - Explanation: step-by-step blueprint
   - Why: small prompts instead of one big prompt
   - Benefits: consistent, predictable results

4. src/pages/learn/FileStructure.tsx
   - Title: "File Structure Conventions"
   - Show the standard src/ structure
   - Explain each folder's purpose

5. src/pages/learn/CTACoverage.tsx
   - Title: "What is CTA Coverage?"
   - Explain: CTA = buttons, links, forms
   - Why it matters: every button must work
   - Simple example

Keep all content short and scannable. Use headings, short paragraphs, bullet points.

DO NOT use complex layouts.
DO NOT use custom CSS.
```

---

## PROMPT 14: Navigation and Layout

```
Add navigation:

1. Create src/components/Layout/Header.tsx
   - Logo/title: "Golden Plan Creator" (links to /)
   - Nav links: Chat, My Plans, Learn
   - User menu: shows email, logout option
   - Mobile: hamburger menu

2. Create src/components/Layout/Layout.tsx
   - Wrapper component with Header
   - Main content area with padding

3. Update all pages to use Layout component

4. Set up React Router in App.tsx:
   - / → Landing
   - /auth → Auth
   - /chat → Chat (protected)
   - /plans → Plans (protected)
   - /plans/:id → Chat with plan loaded (protected)
   - /learn → Learn
   - /learn/:article → Learn sub-pages

Make header sticky on scroll.
Highlight active nav link.

DO NOT change page content.
DO NOT use custom CSS.
```

---

## PROMPT 15: Polish and Mobile

```
Review and polish the entire app:

1. Mobile responsiveness:
   - Test all pages at 375px width
   - Chat input should not be hidden by keyboard
   - Prompt cards should be readable on mobile
   - Navigation works on mobile

2. Loading states:
   - Skeleton loaders for plans list
   - Spinner for initial auth check
   - Disabled buttons while submitting

3. Error handling:
   - Toast notifications for all errors
   - Friendly error messages
   - Retry options where appropriate

4. Empty states:
   - No plans → helpful message + CTA
   - No prompts yet → explanation of next steps

5. Visual polish:
   - Consistent spacing (use Tailwind scale)
   - Consistent typography
   - Hover states on interactive elements
   - Focus states for accessibility

DO NOT add new features.
DO NOT use custom CSS.
```

---

## PROMPT 16: Final Cleanup

```
Final cleanup and optimization:

1. TypeScript:
   - Add proper types to ALL components (no 'any' types)
   - Create interfaces for all props
   - Export shared types from src/types/index.ts

2. Code cleanup:
   - Remove all console.log statements (except error logging)
   - Add JSDoc comments to all hooks
   - Ensure consistent naming conventions

3. Environment variables:
   - Document required env vars in README
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_OPENAI_API_KEY

4. Create HANDOFF_SPEC.md with:
   - Entity: Plan (with all fields)
   - Routes: list all routes
   - CTAs: list all buttons and their actions
   - Known limitations

DO NOT change any functionality.
DO NOT add features.
```

---

## Environment Variables Needed

Before testing, set these in Lovable:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OPENAI_API_KEY=sk-your-openai-key
```

---

## System Prompt for OpenAI

Add this as `src/lib/systemPrompt.ts`:

```typescript
export const SYSTEM_PROMPT = `You are a Golden Plan Creator - an expert consultant that helps non-technical product owners build MVPs in Lovable (an AI app builder).

## Your Role
1. Understand their app idea by asking clarifying questions
2. Generate a sequence of precise Lovable prompts
3. Each prompt builds ONE thing with explicit constraints

## Conversation Flow
Start by understanding what they want to build. Ask about:
- What the app does
- Who uses it (user types/roles)
- What users create or manage (main entity)
- Key actions users take
- What screens/views are needed

Ask 3-5 clarifying questions before generating prompts.

## When Generating Prompts
When the user is ready (or asks for their Golden Plan), generate 12-15 prompts.

Each prompt MUST include:
1. Clear, specific instruction (one thing at a time)
2. CONSTRAINTS section with:
   • DO NOT create extra pages
   • DO NOT add features not mentioned
   • DO NOT use custom CSS (Tailwind only)
3. A VERIFICATION section asking Lovable to self-check

## Output Format
Use this exact format for each prompt:

═══════════════════════════════════════════════════════════
PROMPT [N]: [Title]
═══════════════════════════════════════════════════════════

[Clear instructions for what to build]

CONSTRAINTS:
• DO NOT create extra pages
• DO NOT add features not mentioned
• DO NOT use custom CSS (Tailwind only)

───────────────────────────────────────────────────────────
VERIFICATION [N]: Check Your Work
───────────────────────────────────────────────────────────

Review what you created. Confirm:
- [Specific check 1]
- [Specific check 2]
- [Specific check 3]

If anything is missing or different, list what needs fixing.
Do not add anything new.
═══════════════════════════════════════════════════════════

## Prompt Sequence
Follow this order:
1. Project setup (React + TS + Tailwind + shadcn)
2. Supabase auth
3. Main entity components
4. Secondary entity components (if any)
5. Dashboard page(s)
6. List views
7. Detail views
8. Modals/forms
9. Navigation
10. Data layer (hooks, Supabase queries)
11. Error handling
12. Polish (mobile, loading states)
13-15. Optimization (TypeScript cleanup, HANDOFF_SPEC.md)

## Important Rules
- ONE thing per prompt
- Keep language simple (users are non-technical)
- Always include all three constraints
- Always include verification section
- Be specific about file paths (src/components/...)`;
```

---

## Done!

After completing all 16 prompts, you'll have a working Golden Plan Creator app. Deploy it via Lovable and share with your team.

