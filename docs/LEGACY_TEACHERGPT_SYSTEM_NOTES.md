# Legacy TeacherGPT / Material Mindmap Forge — High‑Signal Notes (Archive)

This document captures **valuable, non-secret** architecture + product concepts extracted from the legacy `TeacherGPT/` folder (and cross‑checked against `external/material-mindmap-forge-main/`, which contains the same KD2025-era system).

**Goal:** preserve the *ideas, data model, and flows* so the legacy folder can be safely removed from this workspace without losing institutional memory.

---

## What the legacy folder contained (by subproject)

- **`TeacherGPT/material-mindmap-forge-1/`**
  - A complete “KD 2025 AI‑Mapper” system concept: upload lesson plan → match to KD werkprocessen → recommend content → exports.
  - Extensive docs (system explanation, MES integration, schema analysis, execution reports).
  - Supabase edge functions + migrations for KD catalog, embeddings, and recommendations.
  - Frontend pages for KD 2025 marketing/knowledge base + mapping UI.

- **`TeacherGPT/material-mindmap-forge/`**
  - Earlier variant of the same idea (smaller).

- **`TeacherGPT/innovitals-hero-blueprint-42-main/`**
  - Marketing/hero site concepts, including an **ExpertFolio** page framing “AI‑lesplanner” value.

- **`TeacherGPT/Nieuwe concept KD VIGVP_ sept 2025 (1).pdf`** + **`TeacherGPT/kd context.txt`**
  - Human-readable KD deltas (old vs new) + narrative analysis used to justify the “new KD concept”.

---

## Legacy KD 2025 (VIGVP) structure (the “14 werkprocessen”)

The legacy system modeled the “Nieuwe concept KD VIGVP sept 2025” as:

- **Basisdeel (niveau 3 + 4)**
  - **B1-K1** (6 werkprocessen): W1..W6
  - **B1-K2** (2 werkprocessen): W1..W2
  - **B1-K3** (3 werkprocessen): W1..W3
- **Profieldeel niveau 4**
  - **P2-K1** (3 werkprocessen): W1..W3
- **Profieldeel niveau 3**
  - **P1-K1** exists as a kerntaak but has **no separate werkprocessen** (uses basisdeel at niveau‑3 complexity)

### “New accents” emphasized in the legacy KD narrative

The legacy KD docs/UX repeatedly framed these as the “new” KD emphases:

- **AI + digitale veiligheid** (explicitly named, not just implied)
- **Zorgtechnologie + ethiek** (as a distinct workprocess theme)
- **SDG’s / duurzaamheid**
- **Social safety** (boundary-crossing behavior, assertiveness) + **beroepsvitaliteit**
- **EBP + klinisch redeneren** positioned more sharply (esp. for niveau 4 diagnosis/coördination)

### Legacy “werkprocessen knowledge base” dataset

Legacy UI data used a structured dataset with:

- **`code`, `title`, `kerntaak`, `explanation`** (plain Dutch)
- **`nieuw`** (what changed vs 2020)
- **`voorbeeld`** (concrete example)
- **`keywords`**
- **`moduleCount`** (claimed available module count per WP)

Source file example: `TeacherGPT/material-mindmap-forge-1/src/data/werkprocessen.ts`.

---

## Legacy architecture: two-layer content model (SoT vs Search Index)

The legacy system separated:

- **Source of Truth layer (MES tables)**: structured course/topic/subject/studytext content (`mes_*` tables).
- **Search Index layer (`ec_products`)**: flattened “products” (topics/studytexts/work items) optimized for:
  - **semantic search** (pgvector embeddings)
  - **fast filtering** by codes (e.g., KD werkproces codes)

This is described in legacy docs like `TeacherGPT/material-mindmap-forge-1/SYSTEM_EXPLANATION.md`.

---

## Legacy database model (high value concepts)

### Content indexing

- **`ec_products`**
  - Flattened learning content records (course/elearning/assignment/etc).
  - Stored `text` + often `study_text` (HTML) for previewing.
  - Stored `embedding` (pgvector) for semantic matching.
  - Stored `kd_codes` (text array) for exact/overlap filtering.

### KD catalog

- **`kd_documents`, `kd_kerntaken`, `kd_werkprocessen`**
  - A normalized KD catalog with a **version** (e.g., `2025-09-01`) + `kerntaken` + `werkprocessen`.
  - Convenience view: `kd_full_structure`.

### User uploads + mapping

- **`user_materials`** + **`user_material_chunks`**
  - Teacher uploads parsed into chunks for embeddings.
- **`mappings`**
  - Stores mapping results linking source items to KD werkprocessen with:
    - **band**: `accept` | `review` | `gap`
    - evidence payload (snippets/keywords/etc)

### Observability

- **`function_logs`** + **`exports`**
  - Execution trace IDs, timing steps, and export tracking.

---

## Legacy core flows (end-to-end)

### 1) Teacher lesson plan → recommendations

The legacy “recommend-content” flow supported multiple entry paths:

- **Upload text** → generate embedding → semantic search over indexed content
- **Select KD codes** → direct KD matching (array overlap) + optional “nearby KD codes”
- **Hybrid**: combine + dedupe + rank

Then it grouped results by **module/course_name**, and attached teacher-friendly metadata:

- content previews (first sentences, bullet “key points”)
- multimedia detection (images/video/YouTube)
- assessment detection (quiz/exercise indicators)
- **quality scoring** (0–10 heuristic)
- time estimates (topic_duration → minutes)

### 2) KD coverage + gap analysis

Legacy UI/logic computed:

- coverage across all 14 werkprocessen
- uncovered WPs (“hiaten”) + priority heuristics
- suggested content to fill gaps

### 3) Exports

Legacy exports included CSV and “PDF-ready JSON” for teacher-facing reporting.

### 4) MES → Search Index sync (optional)

Legacy also described a sync path:

- RPC `get_course_content(course_id)` to aggregate the MES course tree into JSON
- Edge function `sync-mes-content` to flatten studytexts → `ec_products`

---

## Legacy mapping thresholds (accept/review/gap)

Legacy mapping UI used:

- **Accept threshold**: `0.75`
- **Review threshold**: `0.50`
- Below review → **gap**

See: `TeacherGPT/material-mindmap-forge-1/src/store/mappingStore.ts`.

---

## Legacy “language + synonyms” concept (important for Dutch domains)

Legacy UI included per-user language processing settings:

- Toggle “Nederlandse taalverwerking”
- Editable “synonyms config” rules: `term = synonym1, synonym2, ...`

This was intended to improve mapping recall for domain language.

See: `TeacherGPT/material-mindmap-forge-1/src/components/kd/LanguagePanel.tsx`.

---

## ExpertFolio positioning (marketing concept)

Legacy marketing copy positioned an “AI‑lesplanner” that:

- prepares lesson goals, lesson plans, and links to e‑learning + work assignments
- frames readiness for the upcoming “kwalificatiedossier 2026”

See: `TeacherGPT/innovitals-hero-blueprint-42-main/src/pages/ExpertFolio.tsx` (marketing prototype; “Demo binnenkort beschikbaar”).

---

## Parity check vs the **current** IgniteZero repo (this workspace)

### Present in current system (found in code)

- **Material upload → extract → chunk → embeddings**
  - UI: `src/pages/teacher/Materials.tsx`
  - Job: `supabase/functions/ai-job-runner/strategies/material_ingest.ts`
- **TeacherGPT chat grounded in MES/materials with citations**
  - Edge: `supabase/functions/teacher-chat-assistant/index.ts`
  - UI: `src/pages/teacher/TeacherChat.tsx`
- **MES corpus indexing + semantic retrieval**
  - Job: `supabase/functions/ai-job-runner/strategies/mes_corpus_index.ts`
  - Edge: `supabase/functions/recommend-mes-content/index.ts`
  - UI: `src/pages/teacher/MesRecommendations.tsx`
- **Standards ingest → map → export (CSV)**
  - UI: `src/pages/teacher/Standards.tsx`
  - Jobs: `standards_ingest.ts`, `standards_map.ts`, `standards_export.ts`
  - Note: this can be used for KD mapping by ingesting a KD as a “standards document” (codes like `B1-K1-W1: ...` are supported by the parser).
- **Material analysis (summary, key concepts, suggested assignments/questions)**
  - Job: `supabase/functions/ai-job-runner/strategies/material_analyze.ts`

### Not found in current repo (only exists in legacy codebases)

These legacy capabilities are **not present** in the current IgniteZero codebase:

- **Dedicated KD catalog DB tables + seeded VIGVP 2025 structure**
  - No `kd_documents` / `kd_kerntaken` / `kd_werkprocessen` migrations in `supabase/migrations/`.
- **ExpertCollege “ec_products + kd_codes” content catalog**
  - No `ec_products` table or `kd_codes` column in current migrations.
- **Legacy recommend-content engine**
  - No `recommend-content` function, no “nearby KD codes”, no module recommendation grouping based on `ec_products`.
- **Legacy gap analysis + coverage matrix**
  - No equivalent “hiaten/dekkingsmatrix” feature found in current teacher UI or edge functions.
- **Legacy recommendation exports (PDF/CSV for recommended modules)**
  - Current system exports exist for other domains (e.g., books), but not the legacy recommendations output format.
- **Legacy user_settings synonyms panel**
  - The legacy UI wrote to `user_settings`; the current system uses org-scoped entity records and does not include this panel.

---

## Practical takeaway for “KD mapping” in the current system

If you want KD mapping **today** in the current app:

- Represent the KD as a **standards document** (one code per line) and ingest it via the TeacherGPT → Standards UI.
- Upload a lesson plan as a **material**, ingest it, then run **standards_map**.
- Export results as **CSV** via **standards_export**.

If you want the legacy KD2025 product experience (knowledge base UI, dekkingsmatrix/hiaten, ExpertCollege module recommendations), that would require additional porting work.

