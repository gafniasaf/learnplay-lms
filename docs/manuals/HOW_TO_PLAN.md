# 📘 How to Build a Golden Plan (For Coworkers)

This guide explains how to use **Cursor** to architect a perfect software plan ("The Golden Plan") without writing backend code.

## 1. Setup
1.  Open this project in Cursor.
2.  Copy `docs/manuals/cursorrules.template.md` to `.cursorrules` in the root folder (overwrite if needed).
    *   *Why?* This gives the AI the "Brain" to act as your Architect.

## 2. Start a New Plan
1.  Create a folder: `plans/my-awesome-app/`
2.  Open Cursor Chat (`Cmd+L` or `Ctrl+L`).
3.  **Paste your idea** (or raw HTML/PDF text).
    *   *Example:* "Here is the ACTIE clinical reasoning manual. Build a plan for it."

## 3. The Workflow (Chat with the AI)

### Phase A: The Concept
The AI will draft `plan.md`. Read it.
- **You:** "Change the user flow to start with a login screen."
- **AI:** *Updates `plan.md`*

### Phase B: The Mockups
The AI will generate HTML in `mockups/`.
- **You:** "Show me the dashboard." / "Make the buttons blue."
- **AI:** *Updates `mockups/dashboard.html`*
- **Tip:** Click the "Eye" icon in Cursor to preview the HTML file live.

### Phase C: Verification (The Magic Step)
Before you finish, you must prove the plan is solid.
- **You:** "Verify everything."
- **AI:** *Runs `npm run validate`*
    - It checks if every button (`data-cta-id`) leads to a real page.
    - It checks if you missed any requirements.
- **If it fails:** The AI will fix the HTML automatically.

## 4. Done?
When the AI says **"Golden Plan Ready"**:
1.  Commit your changes.
2.  Hand off the `plans/my-awesome-app/` folder to the dev team.

---

## ⚡ Troubleshooting
- **AI is lazy?** Type: "Follow the System Protocol. Run validation."
- **Validation fails?** Ask: "Fix the broken CTAs."

