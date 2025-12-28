## ExpertCollege Exercise Checklist (Strict)

This checklist is enforced in the **EC Expert protocol** in `supabase/functions/_shared/protocols/ec-expert.ts`.

### A. Hard Requirements (FAIL if violated)
- **A1 One fact per exercise**: each exercise tests only the given learning objective.
- **A2 Exactly one blank marker**: exactly **1** placeholder per stem (system uses `[blank]`).
- **A3 Options count**: 3–4 options for MCQ / fill-in-the-blank items.
- **A4 Correctness index**: `correctIndex` is within range.
- **A5 Explanation present**: explanation is non-empty and supports why the correct answer is correct.
- **A6 Language**: Dutch only.
- **A7 No negative stems**: avoid `niet/geen` in the stem (rewrite positively).

### B. Distractor Integrity (FAIL if violated)
- **B1 Wholly false distractors**: each distractor must be **100% false** (no “also true but less complete”).
- **B2 No hedged distractors**: no `meestal/soms/vaak/niet altijd/...` in distractors (frequent source of “partly true”).
- **B3 No ambiguous duplicates**: distractors must not be near-duplicates of the correct option.
- **B4 No suggestive absolutes**: avoid `altijd/nooit/uitsluitend/alleen/enkel/slechts` and similar “extremes” in answer options.
- **B5 No negative options**: avoid `niet/geen` in answer options (rewrite positively).
- **B6 No all/none-of-above**: avoid `alle bovenstaande` / `geen van bovenstaande` (unless explicitly using the “1/2/both/none” question type, which EC Expert currently does not emit).

### C. Option Hygiene (WARN, but triggers revision)
- **C1 Consistent capitalization**: options start with a capital letter.
- **C2 Similar length/format**: no single option that “stands out” by length or odd formatting.
- **C3 No single-abbreviation standout**: avoid one option being the only one with an abbreviation.
- **C4 One knowledge element per option**: avoid options that combine multiple elements (often signaled by lists with `en/of`).
- **C5 Minimal punctuation**: avoid commas/parentheses in stems/options where possible (numeric decimals like `7,4` are OK).
- **C6 Mutually exclusive options**: avoid overlapping options and “cover-all” options that literally contain another option.

### D. Context & Clarity (WARN, but triggers revision)
- **D1 No dangling references**: “hiervan/deze” must have an antecedent.
- **D2 Avoid double negatives**.

### Notes
- The pipeline runs a **Senior Revision** loop (bounded retries) when the checklist finds issues.
- Debug artifacts are written to Storage under `courses/debug/protocol-ec-expert/` for inspection.


