# Golden Plan Creator - Verification Checklist

Paste this into Lovable after completing all prompts to verify everything is built correctly.

---

## VERIFICATION PROMPT

```
Review the entire codebase and verify each item in this checklist. 
For each item, respond with ✅ if it exists and works, or ❌ if missing or broken.
Do not fix anything yet - just report status.

═══════════════════════════════════════════════════════════
STRUCTURE VERIFICATION
═══════════════════════════════════════════════════════════

FILE STRUCTURE:
[ ] src/components/ folder exists
[ ] src/pages/ folder exists
[ ] src/hooks/ folder exists
[ ] src/types/ folder exists
[ ] src/lib/ folder exists
[ ] src/integrations/supabase/ folder exists

COMPONENT FILES:
[ ] src/components/Chat/ChatContainer.tsx exists
[ ] src/components/Chat/ChatMessage.tsx exists
[ ] src/components/Chat/ChatInput.tsx exists
[ ] src/components/Chat/TypingIndicator.tsx exists
[ ] src/components/Prompts/PromptList.tsx exists
[ ] src/components/Prompts/PromptCard.tsx exists
[ ] src/components/Prompts/CopyButton.tsx exists
[ ] src/components/Plans/SavePlanModal.tsx exists
[ ] src/components/Plans/PlanCard.tsx exists
[ ] src/components/Layout/Header.tsx exists
[ ] src/components/Layout/Layout.tsx exists
[ ] src/components/ProtectedRoute.tsx exists

PAGE FILES:
[ ] src/pages/Landing.tsx exists
[ ] src/pages/Auth.tsx exists
[ ] src/pages/Chat.tsx exists
[ ] src/pages/Plans.tsx exists
[ ] src/pages/Learn.tsx exists
[ ] src/pages/learn/IgniteZero.tsx exists
[ ] src/pages/learn/GoldenPlan.tsx exists
[ ] src/pages/learn/FileStructure.tsx exists
[ ] src/pages/learn/CTACoverage.tsx exists

HOOK FILES:
[ ] src/hooks/useAuth.ts exists
[ ] src/hooks/useChat.ts exists
[ ] src/hooks/usePlans.ts exists

TYPE FILES:
[ ] src/types/chat.ts exists (ChatMessage interface)
[ ] src/types/prompt.ts exists (GeneratedPrompt interface)
[ ] src/types/plan.ts exists (Plan interface)

LIB FILES:
[ ] src/lib/openai.ts exists
[ ] src/lib/systemPrompt.ts exists

INTEGRATION FILES:
[ ] src/integrations/supabase/client.ts exists

═══════════════════════════════════════════════════════════
FUNCTIONALITY VERIFICATION
═══════════════════════════════════════════════════════════

AUTHENTICATION:
[ ] Login form has email input
[ ] Login form has password input
[ ] Login form has submit button
[ ] useAuth hook has login function
[ ] useAuth hook has logout function
[ ] useAuth hook tracks user state
[ ] ProtectedRoute redirects to /auth if not logged in

CHAT INTERFACE:
[ ] ChatContainer renders message list
[ ] ChatMessage shows user messages (right-aligned, blue)
[ ] ChatMessage shows assistant messages (left-aligned, gray)
[ ] ChatInput has multiline textarea
[ ] ChatInput has send button
[ ] TypingIndicator shows animated dots
[ ] Chat page auto-scrolls on new message

PROMPT DISPLAY:
[ ] PromptList renders as accordion/expandable
[ ] PromptCard shows prompt number and title
[ ] PromptCard shows build prompt content
[ ] PromptCard shows verification prompt (different background)
[ ] CopyButton copies text to clipboard
[ ] CopyButton shows "Copied!" feedback

OPENAI INTEGRATION:
[ ] systemPrompt.ts exports SYSTEM_PROMPT constant
[ ] openai.ts initializes OpenAI client
[ ] useChat hook sends messages to OpenAI
[ ] useChat hook parses responses for prompts
[ ] "Generate My Golden Plan" button exists

PLAN MANAGEMENT:
[ ] SavePlanModal has name input
[ ] SavePlanModal has description input
[ ] SavePlanModal has save button
[ ] usePlans hook has createPlan function
[ ] usePlans hook has getPlans function
[ ] usePlans hook has getPlan function
[ ] usePlans hook has updatePlan function
[ ] usePlans hook has deletePlan function
[ ] Plans page shows list of saved plans
[ ] PlanCard shows name, date, status
[ ] PlanCard has delete button

NAVIGATION:
[ ] Header shows logo/title
[ ] Header has link to /chat
[ ] Header has link to /plans
[ ] Header has link to /learn
[ ] Header shows user email when logged in
[ ] Header has logout option
[ ] Mobile hamburger menu works

ROUTING:
[ ] / renders Landing page
[ ] /auth renders Auth page
[ ] /chat renders Chat page (when logged in)
[ ] /plans renders Plans page (when logged in)
[ ] /plans/:id loads specific plan
[ ] /learn renders Learn index
[ ] /learn/ignite-zero renders article
[ ] /learn/golden-plan renders article
[ ] /learn/file-structure renders article
[ ] /learn/cta-coverage renders article

KNOWLEDGE BASE:
[ ] Learn page shows article cards
[ ] IgniteZero article explains what it is
[ ] GoldenPlan article explains the concept
[ ] FileStructure article shows folder structure
[ ] CTACoverage article explains CTA concept

═══════════════════════════════════════════════════════════
UI/UX VERIFICATION
═══════════════════════════════════════════════════════════

LANDING PAGE:
[ ] Hero section with title "Golden Plan Creator"
[ ] Subtitle/tagline present
[ ] "Get Started" button links to /chat
[ ] Explanation cards present (3 cards)
[ ] Footer present

RESPONSIVE DESIGN:
[ ] Landing page works on mobile (375px)
[ ] Chat page works on mobile
[ ] Plans page works on mobile (single column)
[ ] Header collapses to hamburger on mobile
[ ] Prompt cards readable on mobile

STATES:
[ ] Loading spinner during auth check
[ ] Loading state while AI responds (TypingIndicator)
[ ] Empty state on Plans page when no plans
[ ] Skeleton loaders on Plans list
[ ] Disabled buttons while submitting

ERROR HANDLING:
[ ] Toast notification system exists
[ ] Login errors show toast
[ ] API errors show toast
[ ] Copy success shows feedback

═══════════════════════════════════════════════════════════
TYPESCRIPT VERIFICATION
═══════════════════════════════════════════════════════════

[ ] No 'any' types used (search for ": any")
[ ] All component props have interfaces
[ ] ChatMessage interface has: id, role, content, timestamp
[ ] GeneratedPrompt interface has: number, title, buildPrompt, verificationPrompt, category
[ ] Plan interface has: id, userId, name, description, chatHistory, generatedPrompts, status, createdAt, updatedAt

═══════════════════════════════════════════════════════════
SUPABASE VERIFICATION
═══════════════════════════════════════════════════════════

[ ] Supabase client properly initialized
[ ] 'plans' table exists with correct columns
[ ] RLS enabled on plans table
[ ] RLS policy allows users to access only their own plans

═══════════════════════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════════════════════

After checking all items, provide:
1. Total items checked
2. Number of ✅ (exists/works)
3. Number of ❌ (missing/broken)
4. List of all ❌ items that need to be fixed

Do not fix anything - just report.
```

---

## QUICK FIX PROMPT

After the verification, if there are ❌ items, paste this:

```
Based on the verification checklist, fix all items marked ❌.

For each fix:
1. State what you're fixing
2. Make the minimal change needed
3. Confirm it's fixed

DO NOT add any new features.
DO NOT change anything that was ✅.
DO NOT use custom CSS.

Fix one item at a time and confirm each fix.
```

---

## FINAL SMOKE TEST

After all items are ✅, paste this for a final test:

```
Perform a smoke test of the complete app:

TEST 1: Landing Page
- Navigate to /
- Verify hero section displays
- Click "Get Started"
- Confirm redirect to /auth (if not logged in) or /chat (if logged in)

TEST 2: Authentication
- Go to /auth
- Verify login form displays
- Confirm email and password inputs exist
- Confirm login button exists

TEST 3: Chat Flow
- Log in (or assume logged in)
- Go to /chat
- Verify initial assistant message displays
- Type a test message
- Confirm message appears in chat
- Confirm TypingIndicator shows

TEST 4: Navigation
- Verify header appears on all pages
- Click each nav link (Chat, My Plans, Learn)
- Confirm each page loads
- On mobile: verify hamburger menu works

TEST 5: Plans Page
- Go to /plans
- If no plans: verify empty state message
- If plans exist: verify plan cards display

TEST 6: Knowledge Base
- Go to /learn
- Verify article cards display
- Click each article
- Confirm content loads

TEST 7: Responsive
- Resize to mobile width (375px)
- Verify all pages still functional
- Verify no horizontal scroll
- Verify text is readable

Report results for each test:
- TEST 1: [PASS/FAIL] - [notes]
- TEST 2: [PASS/FAIL] - [notes]
- etc.
```

---

## PRE-DEPLOY CHECKLIST

Before deploying, verify these manually:

```
ENVIRONMENT VARIABLES:
[ ] VITE_SUPABASE_URL is set
[ ] VITE_SUPABASE_ANON_KEY is set  
[ ] VITE_OPENAI_API_KEY is set

SUPABASE SETUP:
[ ] Project created in Supabase dashboard
[ ] 'plans' table created with all columns
[ ] RLS policies applied
[ ] Auth enabled (email/password)

CLEANUP:
[ ] No console.log statements (except error logging)
[ ] No TODO comments left
[ ] No placeholder text ("Lorem ipsum", etc.)
[ ] All links work (no broken links)

READY TO DEPLOY:
[ ] All verification items ✅
[ ] All smoke tests PASS
[ ] Environment variables confirmed
```

