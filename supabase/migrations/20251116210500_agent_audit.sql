-- Agent audit table for Edge Function agent endpoints
create table if not exists public.agent_audit (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  actor text, -- e.g., header token name or service identifier
  args_hash text, -- sha256 of args to avoid PII in logs
  args jsonb default '{}'::jsonb, -- optional, avoid sensitive fields
  result jsonb,
  success boolean not null default true,
  latency_ms integer,
  created_at timestamptz not null default now()
);

alter table public.agent_audit enable row level security;

-- Read-only to authenticated and anon (optional; restrict later if needed)
grant select on public.agent_audit to authenticated, anon;

-- Indexes for common queries
create index if not exists agent_audit_method_created_idx on public.agent_audit(method, created_at desc);
create index if not exists agent_audit_created_idx on public.agent_audit(created_at desc);

-- Optional retention (daily purge of rows older than 30 days)
-- Requires pg_cron; if not available this block will be a no-op after extension failure is ignored by platform
create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_old_agent_audit()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.agent_audit
  where created_at < now() - interval '30 days';
end;
$$;

-- Schedule daily at 03:00 UTC
do $$
begin
  perform cron.schedule('agent_audit_purge_daily', '0 3 * * *', $$select public.purge_old_agent_audit();$$);
exception
  when undefined_table or insufficient_privilege or undefined_function then
    -- pg_cron not available; ignore
    null;
end $$;


