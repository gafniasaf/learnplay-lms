-- ============================================
-- Minimal Organization/Role Schema
-- ============================================

-- Profiles (minimal role registry)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin','school_admin','teacher','parent','student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organizations (schools)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization users (role within org)
CREATE TABLE IF NOT EXISTS public.organization_users (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_role TEXT NOT NULL CHECK (org_role IN ('school_admin','teacher','parent','student')),
  PRIMARY KEY (org_id, user_id)
);

-- Classes (sections)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Class membership (students/teachers)
CREATE TABLE IF NOT EXISTS public.class_members (
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher','student')),
  PRIMARY KEY (class_id, user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies (safe defaults)
-- ============================================

-- Profiles: users can view and update their own profile
CREATE POLICY "view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Organizations: org admins can view their org
CREATE POLICY "org admins read org" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.org_id = organizations.id 
        AND ou.user_id = auth.uid() 
        AND ou.org_role = 'school_admin'
    )
  );

-- Organization users: members can view their row; admins can view all for their org
CREATE POLICY "view own org user" ON public.organization_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "org admins read all org users" ON public.organization_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.org_id = organization_users.org_id 
        AND ou.user_id = auth.uid() 
        AND ou.org_role = 'school_admin'
    )
  );

-- Classes: teachers in org can view classes of their org
CREATE POLICY "teachers read classes in org" ON public.classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.org_id = classes.org_id 
        AND ou.user_id = auth.uid() 
        AND ou.org_role IN ('school_admin','teacher')
    )
  );

-- Class members: teachers can view their class membership; students can view their own
CREATE POLICY "view own class membership" ON public.class_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "teachers view class members" ON public.class_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.class_members cm2
      WHERE cm2.class_id = class_members.class_id 
        AND cm2.user_id = auth.uid() 
        AND cm2.role = 'teacher'
    )
  );