// Test Supabase Management API
// Required env vars:
// - SUPABASE_PROJECT_REF (e.g. eidcegehaswbtzrwzvfa)
// - SUPABASE_ACCESS_TOKEN (Supabase Management API token, sbp_*)
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error("Missing env: SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const sql = "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'";

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
console.log('Result:', JSON.stringify(data, null, 2));

