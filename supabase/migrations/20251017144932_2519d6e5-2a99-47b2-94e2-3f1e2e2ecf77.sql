-- Enable crypto for UUIDs if needed
create extension if not exists pgcrypto;

-- Sessions
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  course_id text not null,
  content_version text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Rounds
create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  level int not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  base_score int not null default 0,
  mistakes int not null default 0,
  elapsed_seconds int not null default 0,
  distinct_items int not null default 0,
  final_score int
);

-- Attempts
create table if not exists public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  item_id int not null,
  selected_index int not null,
  correct boolean not null,
  latency_ms int not null,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_sessions_user on public.game_sessions(user_id);
create index if not exists idx_sessions_course on public.game_sessions(course_id);
create index if not exists idx_rounds_session on public.game_rounds(session_id);
create index if not exists idx_attempts_round on public.game_attempts(round_id);

-- RLS
alter table public.game_sessions enable row level security;
alter table public.game_rounds enable row level security;
alter table public.game_attempts enable row level security;

-- Policies: users can only see/insert their own data
create policy "select own sessions" on public.game_sessions
  for select using (auth.uid() = user_id);

create policy "insert own sessions" on public.game_sessions
  for insert with check (auth.uid() = user_id);

create policy "select own rounds" on public.game_rounds
  for select using (
    exists (select 1 from public.game_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

create policy "insert own rounds" on public.game_rounds
  for insert with check (
    exists (select 1 from public.game_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

create policy "update own rounds" on public.game_rounds
  for update using (
    exists (select 1 from public.game_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

create policy "select own attempts" on public.game_attempts
  for select using (
    exists (
      select 1 from public.game_rounds r
      join public.game_sessions s on s.id = r.session_id
      where r.id = round_id and s.user_id = auth.uid()
    )
  );

create policy "insert own attempts" on public.game_attempts
  for insert with check (
    exists (
      select 1 from public.game_rounds r
      join public.game_sessions s on s.id = r.session_id
      where r.id = round_id and s.user_id = auth.uid()
    )
  );