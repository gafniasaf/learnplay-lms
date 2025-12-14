// Check for views needed by parent/teacher dashboards
// Required env vars:
// - SUPABASE_PROJECT_REF (e.g. eidcegehaswbtzrwzvfa)
// - SUPABASE_ACCESS_TOKEN (Supabase Management API token, sbp_*)
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error("Missing env: SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const sql = `
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name LIKE '%child%' OR table_name LIKE '%parent%' OR table_name LIKE '%student%' OR table_name LIKE '%teacher%' OR table_name LIKE '%dashboard%')
ORDER BY table_name
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
console.log('Parent/Student/Teacher related tables/views:');
data.forEach(row => console.log(` - ${row.table_name} (${row.table_type})`));

// Also check for specific views
const viewSql = "SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname";
const viewResponse = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: viewSql })
});
const viewData = await viewResponse.json();
console.log('\nAll views:');
viewData.forEach(row => console.log(` - ${row.viewname}`));

