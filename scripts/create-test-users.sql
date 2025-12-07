-- Create Test Users for E2E Testing
-- Run this in Supabase SQL Editor or via Supabase CLI
-- These users are used for automated E2E testing

-- Note: Users must be created via Supabase Auth API or Dashboard
-- This SQL script creates the user records in auth.users table
-- You'll still need to set passwords via Dashboard or Auth API

-- Admin User
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@test.local',
  crypt('TestAdmin123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin"}',
  false,
  '',
  ''
) ON CONFLICT (email) DO NOTHING;

-- Teacher User
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'teacher@test.local',
  crypt('TestTeacher123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"teacher"}',
  false,
  '',
  ''
) ON CONFLICT (email) DO NOTHING;

-- Student User
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'student@test.local',
  crypt('TestStudent123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"student"}',
  false,
  '',
  ''
) ON CONFLICT (email) DO NOTHING;

-- Parent User
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'parent@test.local',
  crypt('TestParent123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"parent"}',
  false,
  '',
  ''
) ON CONFLICT (email) DO NOTHING;

-- Note: After running this, you may need to:
-- 1. Set passwords via Supabase Dashboard > Authentication
-- 2. Enable email auto-confirm in Auth settings
-- 3. Assign roles in your application's user_profiles table

