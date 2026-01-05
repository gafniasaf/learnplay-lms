# Agent Update (2026-01-04): Agent-First Live Proofs

This repo now has a standardized way for agents to **prove pipelines end-to-end** using **real remote Supabase + real LLM providers**, without relying on a finished UI.

If you’re working on other sections of the codebase: you don’t need to change your workflow day-to-day, but you should understand what `verify:live` now does and where to put/inspect proof artifacts.

---

## What changed

### 1) New proof harness

- Proof suites live in `scripts/proofs/`
- Each proof writes artifacts to: `tmp/proofs/<proof_name>/<run_id>/`
- Each proof writes a machine-readable: `proof.json`
- A run summary is written to: `tmp/proofs/summary.json`

### 2) How to run proofs (manual, agent-first)

Proof suites are executed manually via:

```powershell
$env:VERIFY_LIVE = "1"; npx tsx scripts/proofs/run-live-proofs.ts
```

### 3) Live verifier safety hardening (no default IDs)

`scripts/verify-live-deployment.ts` **no longer uses hardcoded default UUIDs** for parent/teacher/student checks.

- Parent endpoints are only exercised if you set `VERIFY_PARENT_ID`
- Teacher/class endpoints are only exercised if you set `VERIFY_TEACHER_ID`
- Student endpoints are exercised if a studentId can be derived from:
  - `VERIFY_STUDENT_ID`, or
  - `VERIFY_USER_ID`, or
  - `VERIFY_PARENT_ID` (via `parent-children`)

If those IDs are not available, the relevant checks are **skipped** (with a clear message).

---

## Why this matters

IgniteZero is built for agent-driven development. Proofs provide a durable, inspectable “truth layer” for:

- async factory jobs
- renderer pipelines (HTML → PDF → PNG)
- LLM prompt pipelines that must match a baseline contract

This enables agents to:

- run the real system
- verify final outputs programmatically (`proof.json`)
- iterate without waiting on UI polish

---

## How to use it (agents)

### If you’re not working on pipelines

- Keep using `npm run verify` and normal tests.
- Only run `npm run verify:live` when you truly need remote truth (cost/time).

### If you’re working on pipelines / async jobs / renderers

- Add or extend a proof in `scripts/proofs/`
- Run the proof runner with `VERIFY_LIVE=1`
- Inspect artifacts in `tmp/proofs/...` (PDF/PNG/JSON) before changing architecture

---

## Adding a new proof (template)

1. Create `scripts/proofs/<name>.proof.ts` exporting a `LiveProof`.
2. Add it to the explicit list in `scripts/proofs/run-live-proofs.ts`.
3. Ensure it writes `proof.json` + artifacts under `tmp/proofs/<name>/<runId>/`.

See `scripts/proofs/README.md` for the contract + rules.

---

## Environment notes (do not print secrets)

`verify:live` requires the same environment setup as other live checks (Supabase + agent token). Proofs may add extra requirements (e.g., `PRINCE_PATH` for PDF rasterization).

Never paste keys or signed URLs into logs or docs.
