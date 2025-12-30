// Create teacher auth user and seed teacher/class data
// SECURITY: requires env vars; no hardcoded secrets.
import { createClient } from "@supabase/supabase-js";
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

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN");
const SUPABASE_PROJECT_REF = resolveProjectRef();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEACHER_EMAIL = requireEnv("SEED_TEACHER_EMAIL");
const TEACHER_PASSWORD = requireEnv("SEED_TEACHER_PASSWORD");
const TEACHER_NAME = requireEnv("SEED_TEACHER_NAME");

// Create teacher user (idempotent-ish)
const { data: teacherUser, error: teacherError } = await supabase.auth.admin.createUser({
  email: TEACHER_EMAIL,
  password: TEACHER_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: TEACHER_NAME },
});

if (teacherError && !teacherError.message.includes("already been registered")) {
  console.error("Teacher create error:", teacherError.message);
  process.exit(1);
}

const teacherId =
  teacherUser?.user?.id ||
  (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email === TEACHER_EMAIL)?.id;

if (!teacherId) {
  console.error("❌ Unable to resolve teacher user id");
  process.exit(1);
}

console.log("Teacher ID:", teacherId);

// Seed via Management API
const childId = requireEnv("SEED_CHILD_ID"); // existing student id
const orgId = requireEnv("SEED_ORG_ID");
const classId = requireEnv("SEED_CLASS_ID");

const sql = `
  -- Create teacher profile
  INSERT INTO public.profiles (id, full_name, role)
  VALUES ('${teacherId}', '${TEACHER_NAME.replace(/'/g, "''")}', 'teacher')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

  -- Create organization if not exists
  INSERT INTO public.organizations (id, name, slug)
  VALUES ('${orgId}', 'Demo School', 'demo-school')
  ON CONFLICT (id) DO NOTHING;

  -- Add teacher to organization
  INSERT INTO public.organization_users (org_id, user_id, org_role)
  VALUES ('${orgId}', '${teacherId}', 'teacher')
  ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role;

  -- Add student to organization
  INSERT INTO public.organization_users (org_id, user_id, org_role)
  VALUES ('${orgId}', '${childId}', 'student')
  ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role;

  -- Create a class
  INSERT INTO public.classes (id, name, owner, org_id)
  VALUES ('${classId}', 'Math 101', '${teacherId}', '${orgId}')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  -- Add student to class
  INSERT INTO public.class_members (class_id, user_id, role)
  VALUES ('${classId}', '${childId}', 'student')
  ON CONFLICT (class_id, user_id) DO UPDATE SET role = EXCLUDED.role;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(SUPABASE_PROJECT_REF)}/database/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ACCESS_TOKEN}`,
  },
  body: JSON.stringify({ query: sql }),
});

console.log("Seed Status:", response.status);
const result = await response.json().catch(() => null);
if (!response.ok) {
  console.log("Error:", JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log("✅ Teacher data seeded successfully");


