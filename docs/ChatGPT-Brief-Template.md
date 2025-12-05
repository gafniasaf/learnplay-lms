# How to Create a Perfect Project Brief with ChatGPT

Use this guide to turn your idea into a complete project blueprint (Plan + Design) using ChatGPT. The output of this chat will be a single document that contains both the execution plan and pixel-perfect mockups, ready to hand over to your development team.

---

## Step 1: Start the Chat

Open ChatGPT and paste this **System Prompt** to set the rules. This tells ChatGPT exactly how to behave.

### Copy & Paste this into ChatGPT:

```
I want you to help me design a software project. Act as a Senior Product Architect.

**Your Goal:** Help me define a complete 'Project Brief' that includes a feature plan and pixel-perfect HTML mockups for every key screen.

**The Process:**
1. **Ask me questions first.** Do not start designing yet. Ask me 3-5 targeted questions to understand the user, the problem, and the core features.
2. **Iterate with me.** Based on my answers, propose a feature list. If I agree, we move to design. If not, ask more questions until the scope is solid.
3. **Generate the Brief.** Once the scope is final, generate a single Markdown document containing:
   - **Project Overview:** High-level summary (2-3 paragraphs).
   - **Core Features:** Bulleted list of what we are building (5-10 items).
   - **Detailed Mockups:** For every key screen (e.g., Home, Dashboard, Settings), provide the **full, valid HTML code** inside specific sections.

**Mockup Rules (Crucial):**
- Use modern, clean design (think Tailwind CSS style).
- Use a dark mode aesthetic (slate-900 background, white text, emerald/blue accents).
- The HTML must be **complete** (include `<html>`, `<head>`, `<body>`, and `<style>` tags).
- Do NOT use external CSS links or JavaScript files. Write all styles inline or in a `<style>` block.
- Structure the final output so each page has its own section starting with `## [Page Name]`, followed by the HTML code block wrapped in triple backticks.

Ready? Ask me your first set of questions to get started.
```

---

## Step 2: Answer & Refine

ChatGPT will now interview you about your project.

### Tips for Better Results:
- **Be specific:** "I want a CRM for dentists" is okay, but "I want a dark-mode CRM where dentists can drag-and-drop appointments and see revenue charts" is better.
- **Iterate on Design:** If ChatGPT proposes a layout, you can say:
  - *"Make the buttons larger"*
  - *"Add a sidebar"*
  - *"Change the primary color to purple"*
  - *"Show me a grid layout instead of a list"*
- **Request Missing Screens:** If it forgets a page (e.g., "Login Screen"), just ask: *"Please add a Login screen to the brief."*
- **Ask for Revisions:** If a mockup doesn't look right, describe what's wrong: *"The hero section is too small. Make it take up 60% of the viewport."*

### Example Conversation:

**ChatGPT:** "What problem does this software solve? Who will use it?"

**You:** "Dentists need to manage patient appointments and track revenue. The main users are receptionists and practice managers."

**ChatGPT:** "Got it. Do you need features like automated reminders, insurance billing, or just basic scheduling?"

**You:** "Just basic scheduling for now, plus a simple revenue dashboard."

**ChatGPT:** "Perfect. Here's what I'm proposing: [feature list]. Does this match your vision?"

**You:** "Yes, but add a 'Patient Notes' section where they can record treatment history."

**ChatGPT:** "Added. Ready to generate the mockups?"

**You:** "Yes, go ahead."

---

## Step 3: The Final Export

When you are happy with the plan and the look of the pages, ask ChatGPT for the final file:

### Say this:

```
This looks great. Please compile everything into the final **Project Brief** document. 

Format it with:
- `## Project Overview` section at the top
- `## Core Features` section with a bulleted list
- One `## [Page Name]` section for each mockup, with the full HTML code in a ```html code block.

Make sure every HTML block is complete and can be opened directly in a browser.
```

---

## Step 4: Review the Output

ChatGPT will give you a long Markdown document. Check that it includes:

✅ **Project Overview** — A clear summary of what you're building.  
✅ **Core Features** — A bulleted list (5-10 items).  
✅ **Mockup Sections** — One `## [Page Name]` heading per screen.  
✅ **HTML Code Blocks** — Each mockup wrapped in ` ```html ... ``` `.  
✅ **Complete HTML** — Every block starts with `<html>` and ends with `</html>`.

### Example Structure:

```markdown
# My Project Brief

## Project Overview
This is a CRM for dental practices...

## Core Features
- Patient appointment scheduling
- Revenue dashboard with charts
- Patient notes and treatment history
- ...

## Home Page
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dental CRM</title>
  <style>
    body { background: #0f172a; color: white; }
    ...
  </style>
</head>
<body>
  <header>...</header>
  <main>...</main>
</body>
</html>
```

## Dashboard
```html
<!DOCTYPE html>
...
</html>
```
```

---

## Step 5: Hand It Over

Copy the entire response from ChatGPT (the whole text). This is your **Project Brief**.

**What you have now:**
- A clear plan of what to build.
- Pixel-perfect mockups for every screen.
- No code to write yourself.
- No database schemas to figure out.

**That's it!** You now have a production-ready spec that defines exactly *what* to build and *how* it should look. Hand this document to your development team (or paste it into the next tool in your workflow) and they'll have everything they need to start building immediately.

---

## Pro Tips

### If ChatGPT Forgets to Add HTML:
Say: *"Please add the full HTML code for the [Page Name] mockup. Remember to include `<html>`, `<head>`, and `<style>` tags."*

### If the Design Looks Wrong:
Be specific: *"The buttons are too small. Make them at least 48px tall."* or *"Add more spacing between the cards."*

### If You Need More Pages:
Just ask: *"Add a Settings page where users can update their profile and change their password."*

### If You Want to Change the Color Scheme:
Say: *"Change the primary color from emerald to purple. Update all buttons and accents."*

---

## Common Mistakes to Avoid

❌ **Don't skip the questions phase.** If you jump straight to "build me a CRM," ChatGPT will guess and you'll waste time revising.

❌ **Don't accept incomplete HTML.** If a mockup is missing `<html>` tags or uses external CSS links, ask ChatGPT to fix it.

❌ **Don't forget mobile screens.** If your app needs a mobile version, explicitly ask: *"Show me the mobile version of the Dashboard."*

❌ **Don't rush.** Take 15-20 minutes to iterate on the design. A solid brief saves days of rework later.

---

## What Happens Next?

Once you have your Project Brief:
1. Save it as a `.md` file (e.g., `my-project-brief.md`).
2. Hand it to your development team or paste it into your build tool.
3. The mockups will be extracted automatically and used as visual references during development.
4. The feature list will be turned into a phased execution plan.

**You've just designed a complete software project without writing a single line of code.** 🎉

