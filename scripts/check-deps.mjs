// Check for tables needed by parent_child_details view
// Required env vars:
// - SUPABASE_PROJECT_REF
// - SUPABASE_ACCESS_TOKEN (Supabase Management API token, sbp_*)
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error("Missing env: SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const tables = ['student_assignments', 'student_goals', 'student_activity_log', 'student_metrics', 'profiles'];
const sql = `
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (${tables.map(t => `'${t}'`).join(', ')})
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql })
});

console.log('Status:', response.status);
const data = await response.json();
const existing = data.map(r => r.table_name);
console.log('Existing:', existing);
console.log('Missing:', tables.filter(t => !existing.includes(t)));

