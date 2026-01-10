# Agent Queue Pump (Always-On Worker) Runbook

This runbook covers running an **always-on** worker that continuously drains the `ai_agent_jobs` queue by calling:

- `POST /functions/v1/ai-job-runner?worker=1&queue=agent`

This removes the dependency on a developer laptop running a local pump loop.

## When you need this

- **BookGen / factory jobs are slow** because you rely only on `pg_cron` (1 tick/minute).
- You want the monitor to keep moving **even when your laptop is off**.

## What you do *not* do

- Do **not** build an infinite loop inside a Supabase Edge Function (execution limits).
- Do **not** hardcode secrets in repo files.

## Option A (recommended): Docker Compose on any always-on machine

This can be:
- A cheap VPS
- A home server/NAS
- A small always-on PC

### 1) Create an environment file on the machine

Create a `.env` file (keep it private) with:

- `SUPABASE_URL`
- `AGENT_TOKEN`
- `ORGANIZATION_ID`

Optional:
- `QUEUE_PUMP_IDLE_SLEEP_MS`
- `QUEUE_PUMP_TICK_SLEEP_MS`
- `QUEUE_PUMP_HTTP_TIMEOUT_MS`
- `QUEUE_PUMP_LOG_EVERY`

### 2) Start the pump

From the repo root:

```bash
docker compose -f docker-compose.queue-pump.yml up -d --build
```

### 3) Watch logs

```bash
docker logs -f ignitezero-agent-queue-pump
```

### 4) Stop

```bash
docker compose -f docker-compose.queue-pump.yml down
```

## Option B: Run as a plain Node process (no Docker)

If you have Node 18+ installed:

```bash
node queue-pump/worker.mjs
```

## Cost / “do I need a paid account?”

- **If you already have an always-on machine**: no new paid account required.
- **If you want a cloud VM/container**: typically **a small paid plan** is needed for 24/7 uptime (often ~$5–$10/mo), though some providers have limited free tiers.

## Related (PDF rendering)

Queue pumping only advances **LLM/factory jobs**.

If you also want **PDF rendering** to be laptop-independent, you must run the render worker too:

- `docker-compose.book-worker.yml` (see `docs/BOOK_WORKER_DOCKER_RUNBOOK.md`)


