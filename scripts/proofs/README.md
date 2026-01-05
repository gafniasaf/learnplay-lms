# Proof Suites (Live, Agent-First)

This folder contains **live proof suites**: deterministic scripts that run against **real remote Supabase** + **real LLM providers**, produce durable artifacts, and emit a machine-readable `proof.json`.

These proofs exist to let an AI agent (and humans) validate **final outputs** end-to-end without needing a polished UI first.

## What is a “Proof”?

A proof is an integration-grade check that:

- **Runs against the real deployed system** (Edge Functions + DB + Storage + remote LLM providers)
- **Produces artifacts** (PDFs/PNGs/JSON diffs/etc.) under a stable location
- **Asserts** specific expectations and fails loudly if they’re not met

## Directory & Artifact Contract

Each proof must write outputs to:

`tmp/proofs/<proof_name>/<run_id>/`

And must write:

`tmp/proofs/<proof_name>/<run_id>/proof.json`

### `proof.json` schema (minimum)

```json
{
  "name": "bookgen-baseline",
  "runId": "run-1736000000000",
  "status": "passed",
  "artifacts": ["baseline.chapter1.pdf", "generated.chapter1.pdf", "summary.json"],
  "assertions": [
    { "check": "hierarchy.chapterTitleMatchesBaseline", "pass": true },
    { "check": "render.generatedPdfExists", "pass": true }
  ],
  "startedAt": "2026-01-04T00:00:00.000Z",
  "finishedAt": "2026-01-04T00:05:00.000Z"
}
```

Notes:
- `artifacts` should be **paths relative to the run directory**.
- Do **not** include signed URLs or secret values in `proof.json`.

## How proofs are executed

Proofs are executed manually (agent-first) by running the proof runner with live verification enabled:

```powershell
$env:VERIFY_LIVE = "1"; npx tsx scripts/proofs/run-live-proofs.ts
```

Proofs are intentionally **not** run by default in `npm run verify` to keep local loops fast.

## Rules (Non-negotiable)

- **No secret printing**: never log tokens, keys, or signed URLs.
- **Fail loud**: missing env vars must throw `BLOCKED: <VAR> is REQUIRED`.
- **Bounded loops**: any retry/poll loop must have a clear timeout and exit condition.
- **No fallbacks for tenant IDs**: never default organization/user IDs; require explicit env vars or skip that check with a clear message.

## Adding a new proof

1. Create `scripts/proofs/<name>.proof.ts` exporting a proof module.
2. Add it to the list in `scripts/proofs/run-live-proofs.ts`.
3. Ensure it writes `proof.json` + artifacts to `tmp/proofs/<name>/<runId>/`.

