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

## Option B: Fly.io (managed always-on machine)

This is the simplest “no-SSH” option, but requires:
- A Fly.io account with billing enabled
- `flyctl` installed
- A `FLY_API_TOKEN` (**Personal Access Token / Organization token**, not “App Deploy Token”)
  - If the Fly UI asks you to “select an app”, you’re creating an **App Deploy Token** — that won’t work until an app exists.
  - Create a **Personal Access Token** instead (or use the “old Access Tokens” page link), then we will create the app via `flyctl`.
  - Do NOT paste tokens in chat; set them in a local env file (gitignored) or in your shell.

### Deploy

1) Set required env vars in your shell (or in a local secret env file you do not commit):
- `FLY_API_TOKEN`
- `FLY_APP_NAME` (must be globally unique, e.g. `ignitezero-queue-pump-yourname`)
- `SUPABASE_URL`
- `AGENT_TOKEN`
- `ORGANIZATION_ID`

2) Install `flyctl` (official installer):

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

3) Run the deploy script:

```powershell
.\scripts\ops\deploy-queue-pump-fly.ps1
```

4) Watch logs:

```powershell
flyctl logs -a $env:FLY_APP_NAME
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


