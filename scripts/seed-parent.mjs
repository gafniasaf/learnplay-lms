// Seed minimal parent/child/student data for live parent endpoints.
// Requires auth users already created (parent@example.com, child@example.com).
// SECURITY: requires env vars; no hardcoded secrets.

import fs from "node:fs";
import path from "node:path";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    process.exit(1);
  }
  return v.trim();
}

function resolveProjectRef() {
  const fromEnv = process.env.SUPABASE_PROJECT_REF;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();

  const url = process.env.SUPABASE_URL;
  if (url && typeof url === "string") {
    const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (m?.[1]) return m[1];
  }

  try {
    const toml = fs.readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf-8");
    const m = toml.match(/^\s*project_id\s*=\s*\"([a-z0-9]+)\"\s*$/m);
    if (m?.[1]) return m[1];
  } catch {
    // ignore
  }

  console.error("❌ SUPABASE_PROJECT_REF is REQUIRED (or set SUPABASE_URL, or ensure supabase/config.toml has project_id)");
  process.exit(1);
}

const SUPABASE_ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN");
const SUPABASE_PROJECT_REF = resolveProjectRef();

const sql = `
DO $$
DECLARE
  p_id uuid;
  c_id uuid;
BEGIN
  SELECT id INTO p_id FROM auth.users WHERE email = 'parent@example.com';
  SELECT id INTO c_id FROM auth.users WHERE email = 'child@example.com';

  IF p_id IS NULL OR c_id IS NULL THEN
    RAISE EXCEPTION 'Missing auth users';
  END IF;

  -- cleanup
  DELETE FROM public.student_activity_log WHERE student_id = c_id;
  DELETE FROM public.student_assignments WHERE student_id = c_id;
  DELETE FROM public.student_goals WHERE student_id = c_id;
  DELETE FROM public.student_metrics WHERE student_id = c_id;
  DELETE FROM public.parent_children WHERE parent_id = p_id AND child_id = c_id;
  DELETE FROM public.profiles WHERE id IN (p_id, c_id);

  -- profiles
  INSERT INTO public.profiles (id, full_name)
  VALUES (p_id, 'Pat Parent'), (c_id, 'Sam Student')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- link
  INSERT INTO public.parent_children (parent_id, child_id, status, linked_at)
  VALUES (p_id, c_id, 'active', now())
  ON CONFLICT DO NOTHING;

  -- metrics
  INSERT INTO public.student_metrics (student_id, streak_days, xp_total, last_login_at)
  VALUES (c_id, 5, 3200, now() - interval '1 day')
  ON CONFLICT (student_id) DO UPDATE
  SET streak_days = EXCLUDED.streak_days,
      xp_total = EXCLUDED.xp_total,
      last_login_at = EXCLUDED.last_login_at;

  -- assignments
  INSERT INTO public.student_assignments (student_id, course_id, title, due_at, status, progress_pct)
  VALUES
    (c_id, 'math-101', 'Algebra Practice', now() + interval '3 days', 'in_progress', 40),
    (c_id, 'sci-201', 'Physics Worksheet', now() + interval '5 days', 'not_started', 0)
  ON CONFLICT DO NOTHING;

  -- goals
  INSERT INTO public.student_goals (id, student_id, title, target_minutes, progress_minutes, due_at, status)
  VALUES
    (gen_random_uuid(), c_id, 'Weekly Reading', 120, 45, now() + interval '6 days', 'behind'),
    (gen_random_uuid(), c_id, 'Math Mastery', 180, 120, now() + interval '10 days', 'on_track')
  ON CONFLICT DO NOTHING;

  -- activity
  INSERT INTO public.student_activity_log (id, student_id, event_type, description, metadata, occurred_at)
  VALUES
    (gen_random_uuid(), c_id, 'assignment_completed', 'Completed Fractions Drill', '{\"course\":\"math-101\"}', now() - interval '2 days'),
    (gen_random_uuid(), c_id, 'login', 'Logged in', '{}', now() - interval '1 days'),
    (gen_random_uuid(), c_id, 'assignment_completed', 'Finished Reading Chapter 3', '{\"course\":\"reading\"}', now() - interval '4 days')
  ON CONFLICT DO NOTHING;
END $$;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(SUPABASE_PROJECT_REF)}/database/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ACCESS_TOKEN}`,
  },
  body: JSON.stringify({ query: sql }),
});

console.log("Status:", response.status);
const text = await response.text();
try {
  const data = JSON.parse(text);
  console.log("Result:", JSON.stringify(data, null, 2));
  if (!response.ok) process.exit(1);
} catch {
  console.log("Response:", text.slice(0, 500));
  if (!response.ok) process.exit(1);
}


