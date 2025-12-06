-- Create assignments tables
create table if not exists public.assignments(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  course_id text not null,
  title text not null,
  due_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_assignees(
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  assignee_type text not null check (assignee_type in ('class','student')),
  class_id uuid references public.classes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  constraint valid_assignee_type check (
    (assignee_type = 'class' and class_id is not null and user_id is null) or
    (assignee_type = 'student' and user_id is not null and class_id is null)
  )
);

-- Unique constraint to prevent duplicate assignments
create unique index assignment_assignees_unique_class on public.assignment_assignees(assignment_id, class_id) 
  where assignee_type = 'class';
create unique index assignment_assignees_unique_student on public.assignment_assignees(assignment_id, user_id) 
  where assignee_type = 'student';

-- Enable RLS
alter table public.assignments enable row level security;
alter table public.assignment_assignees enable row level security;

-- Assignment policies
-- Teachers can manage assignments in their org
create policy "teacher manage assignments" on public.assignments
for all using (
  exists(select 1 from public.organization_users ou
    where ou.org_id=assignments.org_id and ou.user_id=auth.uid() and ou.org_role in ('school_admin','teacher'))
) with check (
  exists(select 1 from public.organization_users ou
    where ou.org_id=assignments.org_id and ou.user_id=auth.uid() and ou.org_role in ('school_admin','teacher'))
);

-- Students read assignments assigned to their class or them personally
create policy "student read assignments" on public.assignments
for select using (
  exists(
    select 1 from public.assignment_assignees aa
    left join public.class_members cm on cm.class_id=aa.class_id and cm.user_id=auth.uid() and cm.role='student'
    where aa.assignment_id=assignments.id
    and (
      (aa.assignee_type='class' and cm.user_id is not null) or
      (aa.assignee_type='student' and aa.user_id=auth.uid())
    )
  )
);

-- Assignees: teachers manage
create policy "teacher manage assignees" on public.assignment_assignees
for all using (
  exists(select 1 from public.assignments a
    join public.organization_users ou on ou.org_id=a.org_id and ou.user_id=auth.uid() and ou.org_role in ('school_admin','teacher')
    where a.id=assignment_assignees.assignment_id)
) with check (
  exists(select 1 from public.assignments a
    join public.organization_users ou on ou.org_id=a.org_id and ou.user_id=auth.uid() and ou.org_role in ('school_admin','teacher')
    where a.id=assignment_assignees.assignment_id)
);

-- Students read their own assignee rows
create policy "student read assignees" on public.assignment_assignees
for select using (
  (assignee_type='student' and user_id=auth.uid()) or
  (assignee_type='class' and exists(select 1 from public.class_members cm 
    where cm.class_id=assignment_assignees.class_id and cm.user_id=auth.uid() and cm.role='student'))
);