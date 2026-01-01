## Autonomous Marketing Hub – Refactor Execution Plan (Cursor Handoff)

**Audience:** Cursor AI coding agent operating on a **copy** of this repo.  
**Goal:** Refactor this Ignite Zero system into a **100% AI‑managed marketing + distribution hub** (no human approvals, no human-in-the-loop).  
**Philosophy (generic):** “Core truth + local expertise + fragmentation-as-moat” for any domain (education, publishing, SaaS, healthcare, manufacturing, etc.).

---

## 0) Mandatory reading (do this before touching code)

1. `docs/AI_CONTEXT.md` (architecture invariants, no-fallback policy, diagnostic protocol)  
2. `docs/AGENT_BUILD_PROTOCOL.md` (the ONLY allowed build sequence: scaffold → compile → wire → verify)  
3. `PLAN.md` (current golden plan; update it to the new domain before building features)  
4. `docs/EDGE_DEPLOYMENT_RUNBOOK.md` (Edge Function patterns; 503 avoidance; hybrid auth)

If you skip these, you will build the wrong thing and break verification.

---

## 1) Non‑negotiable constraints (system rules you MUST follow)

- **Manifest-first**: `system-manifest.json` is the domain source of truth.
  - Update the manifest first; then run `npx tsx scripts/scaffold-manifest.ts`.
  - **Never edit** `src/lib/contracts.ts` manually.
- **Factory-first**: Do not hand-write page implementations from scratch.
  - Generate scaffolds via `node scripts/compile-learnplay.cjs` (or the repo’s configured compile script).
  - Only *enhance* scaffolds by wiring to existing hooks/stores (`src/hooks/useMCP.ts`, etc.).
- **MCP-first mutations**: All “save/generate/publish” writes flow through the MCP layer / proxy patterns where used.
  - UI uses `useMCP()` and calls manifest-driven CRUD and job methods.
- **Absolute no-fallback policy**:
  - No `process.env.X || 'default'`, no placeholder tokens, no “mock success”.
  - Missing config must **FAIL LOUD** and surface **BLOCKED** with exact missing env var names.
- **100% CTA tracking**:
  - Every interactive element must have `data-cta-id`. Don’t bypass CTA verification.
- **Bounded repair loops**:
  - If a recurring failure persists after 3 attempts, **HALT** and request human review (per `docs/AI_CONTEXT.md`).
- **Migrations rule**:
  - If schema changes are introduced, migrations must be applied to the target Supabase project immediately or the work is **BLOCKED**.

---

## 2) What “100% AI-managed marketing” means (definition)

The system must run an autonomous closed loop with no approvals:

**Sense → Decide → Make → Guard → Publish → Measure → Optimize**

Where:
- **Sense**: ingest market/audience signals (platform analytics, web research, competitor updates).
- **Decide**: generate strategy, segment selection, offer packaging, channel plan, experiment plan.
- **Make**: generate assets (social posts, emails, landing pages/microsites, PDFs/print).
- **Guard**: enforce policy-as-code (brand voice, compliance, claims, accessibility, link checks).
- **Publish**: push to channels (web, email, social) automatically.
- **Measure**: pull results back (CTR, conversions, engagement, retention).
- **Optimize**: select winners, revise strategy, schedule next batch.

**Critical safety requirement:** if Guard fails, the system must halt publishing/spend for that campaign/channel and log why (no silent degradation).

---

## 3) Value-first product wedge (build this first)

Ship the smallest autonomous loop that creates measurable value quickly:

### MAMP (Minimum Autonomous Marketing Product)
- Owned distribution only at first (lowest risk):
  - **Website/microsites** (publish to Storage + serve)
  - **Email** (one provider)
  - **One social channel** (e.g., FB Page or LinkedIn Page)
- Multi-language later (Phase 3). Partner co-brand later (Phase 4). Paid ads later (Phase 7).

---

## 4) Target domain model (generic, actionable defaults)

These names are recommended defaults for the new manifest. You may adjust, but keep naming consistent everywhere (manifest → contracts → UI → MCP → edge).

### Root entities (minimum set for Phase 2)
- **Brand**: voice rules, design tokens, disclaimers, claim policy, tone, do-not-say list.
- **Offer**: product/service/package; pricing constraints; target outcomes.
- **AudienceSegment**: buyer persona/segment (pains, objections, triggers, channels).
- **Campaign**: strategy container (goal, locale(s), offers, segments, schedule, KPIs, status).
- **Asset**: generated content unit (post/email/page/pdf) + variant metadata + storage paths.
- **Experiment**: A/B/n plan with traffic split rules and winner criteria.
- **Signal**: ingested evidence (analytics events, competitor diffs, research summaries).
- **PolicyPack**: composable policy rulesets (brand, compliance, claims, channel constraints).
- **ChannelConfig**: integration state + publish limits + kill switches (NO secrets stored here).
- **JobTicket**: keep/extend existing job queue entity pattern (already present).

### Expansion entities (later phases)
- **Partner**: distributor/affiliate/university/client with branding kit and locale focus.
- **AccountPlan**: per-partner/per-client plan (objectives, pipeline, commitments).
- **Battlecard**: competitor positioning + objection responses.
- **TrainingModule**: internal enablement content generated from campaigns/offers.

---

## 5) Job registry (manifest-driven, phased)

Use async jobs for long-running work; keep synchronous jobs only for low-latency UI actions (<2s) per `docs/AI_CONTEXT.md`.

### Phase 2 (MAMP) jobs
- **mkt_research_brief** (async): gather signals (analytics + light web research), output structured `Signal`s.
- **mkt_campaign_plan** (sync or async): pick segment + offer + angle + channel plan + experiment plan.
- **mkt_asset_factory** (async): generate assets (social/email/landing/pdf) + store artifacts.
- **mkt_guard_assets** (sync or async): enforce PolicyPacks (brand, claims, compliance, CTA presence, accessibility).
- **mkt_publish_assets** (async): publish to channels (web/email/social). MUST be idempotent.
- **mkt_measure_results** (async): fetch performance metrics and store as `Signal`s.
- **mkt_optimize_campaigns** (async): update next batch schedule, choose winners, retire losers, adjust strategy.

### Phase 3+ expansion jobs
- **mkt_localize_assets**: translate/transcreate with glossary + meaning-drift checks.
- **mkt_competitor_radar**: monitor competitor pages; diff; generate Battlecards.
- **mkt_opportunity_matrix**: cross-check offers × segments × signals; propose new campaigns.
- **mkt_training_from_campaign**: generate enablement/training modules for employees.
- **mkt_paid_autopilot**: paid ads with strict budget governors + anomaly stop rules.

---

## 6) Safety architecture for “no humans”

### 6.1 Policy-as-code (required)
Create PolicyPacks that the Guard job evaluates. Examples (generic):
- Brand voice constraints (tone, banned phrases, style).
- Claims policy (regulated/medical/financial claims constraints).
- Jurisdiction/local rules (required disclaimers per locale).
- Channel rules (character limits, hashtag rules, link rules, image alt text required).
- Frequency rules (max posts/day; quiet hours; pacing).

### 6.2 Circuit breakers (required)
Model these as explicit fields in `ChannelConfig` and/or `Campaign`:
- `publish_enabled` (boolean) – hard kill switch
- `max_publishes_per_day`
- `max_guard_failures_before_halt`
- `halt_until` timestamp
- optional: paid budgets (`daily_cap`, `monthly_cap`, `cpa_stop`, `roas_stop`)

**Rule:** If a breaker trips, publishing/spend must stop and surface a clear BLOCKED reason.

### 6.3 Idempotency + dedupe (required)
Publishing jobs must be safe to retry:
- Use deterministic idempotency keys (campaignId + assetId + channel + date).
- Store “publish receipt” in job result / asset metadata and refuse duplicates.

---

## 7) Phased execution plan (what to do, in order)

### Phase 0 — Baseline snapshot (½–1 day)
**Goal:** Prove the copy is healthy before refactor.

**Steps**
- Install deps: `npm install`
- Run setup (Docker + MCP + Supabase local): `npm run setup`
- Verify baseline: `npm run verify`
- Capture MCP health: `npm run diag:lms`

**Exit criteria**
- `npm run verify` passes with zero changes.

---

### Phase 1 — Update the plan (PLAN.md) + UI spec (1–2 days)
**Goal:** Replace the LearnPlay plan with the new “Autonomous Marketing Hub” plan.

**Steps**
- Rewrite `PLAN.md` to the new domain:
  - Personas: Marketing operator, Founder/Board, Partner/Client manager, Employee.
  - Journeys: create campaign → autonomous publish → measure → iterate; create partner kit; multi-locale publish; dashboards.
- Update mockups:
  - Add/modify HTML mockups under `mockups/` for the new route map.
  - Update `docs/mockups/coverage.json` for every route/state/CTA.
  - Run: `npm run mock:validate` and `npm run test:cta-smoke` (fix mockups if failing).

**Exit criteria**
- Mock coverage validates and CTA smoke passes.
- `PLAN.md` describes exactly what will be built (no extra features).

---

### Phase 2 — Manifest refactor + scaffold + compile + verify (2–7 days)
**Goal:** Make the system “marketing-shaped” while staying build-protocol-compliant.

**Steps (strict order)**
1. Update `system-manifest.json`:
   - Replace/introduce entities (Section 4).
   - Register jobs (Section 5) with correct `execution_mode` and UI placement.
2. Generate contracts:
   - `npx tsx scripts/scaffold-manifest.ts`
   - `npm run typecheck` (must pass before continuing)
3. Compile mockups to routes/pages:
   - `node scripts/compile-learnplay.cjs`
4. Wire scaffolds (enhance, don’t rewrite):
   - Use `src/hooks/useMCP.ts` to list/save records and enqueue jobs.
   - Ensure every CTA has a handler wired and tracked.
5. Full verification:
   - `npm run verify`

**Exit criteria**
- You can CRUD `Brand`, `Offer`, `AudienceSegment`, `Campaign`, `Asset`, `PolicyPack`, `ChannelConfig`.
- You can enqueue a placeholder *real* job that fails loudly if secrets are missing (no mock success).
- `npm run verify` passes.

---

### Phase 3 — MAMP: autonomous loop on owned channels (2–5 weeks)
**Goal:** The closed-loop system runs unattended for one locale + 1–2 channels.

**Implementation notes**
- Prefer building a vertical slice end-to-end:
  - Campaign → research brief → plan → asset factory → guard → publish → measure → optimize.
- Keep paid ads out of Phase 3.

**Deliverables**
- **ResearchBrief**: ingest analytics + basic web research → `Signal` records.
- **CampaignPlanner**: choose angle/CTA/offer per segment.
- **AssetFactory**:
  - social post(s)
  - email newsletter
  - landing page/microsite
  - optional PDF one-pager (reuse existing PDF/render pipeline where possible)
- **Guard**:
  - enforce PolicyPacks
  - link check (HTTP 200)
  - CTA presence check
  - accessibility minimums for pages
- **Publisher**:
  - web publish: upload to Storage path convention and expose URL
  - social publish: publish via real API (BLOCKED if not configured)
  - email send: via real provider (BLOCKED if not configured)
- **Measure**:
  - pull channel metrics and store as Signals
- **Optimize**:
  - A/B rules: traffic split, winner selection, retire losers
  - pacing rules for future publishes

**Testing requirements**
- Add hook contract tests for any new hook that calls MCP/Edge (see `docs/AI_CONTEXT.md` contract testing section).
- Add integration tests for publish/guard contracts where possible.

**Exit criteria**
- A campaign can run 14+ days without operator action.
- Circuit breakers reliably stop publishing on guard failures/anomalies.
- System produces an auditable log of “what it published and why”.

---

### Phase 4 — Polyglot Press: autonomous localization (3–6 weeks)
**Goal:** One campaign becomes multi-locale without humans.

**Deliverables**
- Glossary/terminology entity and enforcement in localization job.
- Meaning-drift detection between source and localized content.
- Locale-specific PolicyPack overlays (required disclaimers, forbidden claims).
- Multi-locale publishing schedule and per-locale metrics.

**Exit criteria**
- Add a new language by data/config only.
- Localization jobs do not silently degrade; they halt on drift/policy violations.

---

### Phase 5 — Partner/Client Kit Factory (4–8 weeks)
**Goal:** Automated co-branded marketing kits for partners/clients (white-label distribution).

**Deliverables**
- Partner entity with branding kit and allowed locales/offers.
- Auto-generated partner landing pages + co-branded PDFs + email/social kits.
- Account plans: AI maintains objectives + pipeline suggestions.
- Partner performance optimization (per partner messaging/angles).

**Exit criteria**
- New partner kit can be generated end-to-end in <1 hour, unattended.

---

### Phase 6 — Market intelligence + opportunity engine (4–8 weeks)
**Goal:** Strategy updates continuously; fragmentation becomes your moat.

**Deliverables**
- Living competitor radar: monitor → diff → battlecard updates.
- Opportunity matrix: offers × segments × signals → propose campaigns.
- Product development suggestion loop: objections + conversion data → roadmap hypotheses + GTM tests.

**Exit criteria**
- System proposes and launches new experiments based on evidence, not schedules.

---

### Phase 7 — Enablement engine (3–6 weeks)
**Goal:** Internal teams automatically stay aligned; execution quality scales.

**Deliverables**
- Training modules generated from campaigns/offers/partner kits.
- Sales simulator (roleplay objections per segment; scoring and coaching).
- Employee dashboards that always reflect “what to say / what works now”.

---

### Phase 8 — Paid autopilot (optional; high leverage, high risk) (4–8 weeks)
**Goal:** Autonomous paid acquisition with strict governors.

**Deliverables**
- Budget caps, CPA/ROAS stop rules, anomaly detection, creative refresh pipeline.
- Explicit “sandbox vs production” environment config (no mocks; real channels only).

**Exit criteria**
- Spend halts automatically on anomalies and policy failures.

---

## 8) Environment variables (do not invent defaults)

**Rule:** If any of these are missing, the system must **BLOCK** and surface the missing var name(s). Do not print secret values.

### Always required for the platform
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` (frontend)
- `AGENT_TOKEN` (edge job auth)
- `MCP_AUTH_TOKEN` / `MCP_BASE_URL` (for local MCP development)

### LLM providers (as needed by jobs)
- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`

### Channel integrations (names are project-defined; document them)
- Email provider key(s)
- Social provider key(s)
- Analytics provider key(s)

**Secrets resolution order:** follow `docs/AI_CONTEXT.md` (env → `supabase/.deploy.env` → `learnplay.env` → `.env*`). Never commit secrets.

---

## 9) Deployment + migrations (when going live)

### Local development
- Local Supabase uses Docker (`supabase start`). MCP server uses Docker (`npm run mcp:ensure`).

### Remote deployment (required when ready)
- Read `docs/EDGE_DEPLOYMENT_RUNBOOK.md` before deploying.
- Deploy functions: `.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env`
- Verify live: `npx tsx scripts/verify-live-deployment.ts`

### Migrations
- If schema changes exist, apply them immediately to the target project (CLI linked project or approved deploy path).
- If missing `SUPABASE_ACCESS_TOKEN` / project ref: report **BLOCKED** with the exact missing env var(s).

---

## 10) Integration later (keep it easy)

If you want to integrate the refactor back into the original system later:
- Keep domain-specific code **namespaced** (tables/functions/jobs/routes).
- Extract and backport **shared** capabilities (guardrails, publisher connectors, experiment engine) without forcing a “mega-manifest”.
- Prefer “two apps / two manifests, shared core” over “one app with two domains” unless you explicitly need a merged UX.

---

## 11) Definition of Done (DoD)

Minimum DoD (Phase 3 complete):
- Autonomous loop runs 14 days without human approvals.
- At least one channel publishes real assets automatically.
- Guardrails + circuit breakers prevent unsafe publishing.
- Full audit log exists for every publish (inputs, policies applied, outputs, receipts).
- `npm run verify` passes.

Extended DoD (Phases 4–6):
- Multi-locale autonomous publishing with glossary + drift checks.
- Partner kit factory and continuous market intelligence.



