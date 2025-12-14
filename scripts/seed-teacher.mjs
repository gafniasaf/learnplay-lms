// Create teacher auth user and seed teacher/class data
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error("Missing env: SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

// Create teacher user
const { data: teacherUser, error: teacherError } = await supabase.auth.admin.createUser({
  email: "teacher@example.com",
  password: "Teacher123!",
  email_confirm: true,
  user_metadata: { full_name: "Ms. Teacher" }
});

if (teacherError && !teacherError.message.includes("already been registered")) {
  console.error("Teacher create error:", teacherError);
} else {
  const teacherId = teacherUser?.user?.id || (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === "teacher@example.com")?.id;
  console.log("Teacher ID:", teacherId);

  // Seed via Management API
  const childId = "b2ed7195-4202-405b-85e4-608944a27837"; // existing student
  
  const sql = `
    -- Create teacher profile
    INSERT INTO public.profiles (id, full_name, role)
    VALUES ('${teacherId}', 'Ms. Teacher', 'teacher')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

    -- Create organization if not exists
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Demo School', 'demo-school')
    ON CONFLICT (id) DO NOTHING;

    -- Add teacher to organization
    INSERT INTO public.organization_users (org_id, user_id, org_role)
    VALUES ('00000000-0000-0000-0000-000000000001', '${teacherId}', 'teacher')
    ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role;

    -- Add student to organization
    INSERT INTO public.organization_users (org_id, user_id, org_role)
    VALUES ('00000000-0000-0000-0000-000000000001', '${childId}', 'student')
    ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role;

    -- Create a class
    INSERT INTO public.classes (id, name, owner, org_id)
    VALUES ('11111111-0000-0000-0000-000000000001', 'Math 101', '${teacherId}', '00000000-0000-0000-0000-000000000001')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    -- Add student to class
    INSERT INTO public.class_members (class_id, user_id, role)
    VALUES ('11111111-0000-0000-0000-000000000001', '${childId}', 'student')
    ON CONFLICT (class_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  `;

  const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });

  console.log('Seed Status:', response.status);
  const result = await response.json();
  if (response.status >= 400) {
    console.log('Error:', JSON.stringify(result, null, 2));
  } else {
    console.log('Teacher data seeded successfully');
  }
}

