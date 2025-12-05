-- 1. Tenants (The Workspace)

create table organizations (

  id uuid primary key default gen_random_uuid(),

  name text not null,

  slug text unique not null,

  settings jsonb default '{}'::jsonb,

  created_at timestamptz default now()

);



-- 2. The Root Entity (Projects) - Metadata Only

create table projects (

  id uuid primary key default gen_random_uuid(),

  organization_id uuid references organizations(id) not null,

  name text not null,

  description text,

  -- The Hybrid Link: Versioning & Integrity

  content_version int default 1,

  updated_at timestamptz default now()

);



-- 3. The AI Job Queue (The Async Brain)

create table ai_agent_jobs (

  id uuid primary key default gen_random_uuid(),

  organization_id uuid references organizations(id),

  job_type text not null, -- e.g., 'generate_subtasks'

  status text default 'queued', -- queued, processing, completed, failed

  payload jsonb, -- The input prompt/data

  result jsonb, -- The AI output

  created_at timestamptz default now()

);



-- 4. Storage Bucket (The Content Store)

insert into storage.buckets (id, name, public) 

values ('projects', 'projects', false)

on conflict (id) do nothing;



-- 5. Row Level Security (The Guardrails)

alter table projects enable row level security;

alter table ai_agent_jobs enable row level security;



-- Policy: Users can only see their Org's data

create policy "Org Isolation" on projects

  using (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

