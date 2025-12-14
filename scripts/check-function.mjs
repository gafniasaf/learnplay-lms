// Check if update_updated_at_column function exists
// Required env vars:
// - SUPABASE_PROJECT_REF
// - SUPABASE_ACCESS_TOKEN (Supabase Management API token, sbp_*)
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error("Missing env: SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const sql = "SELECT proname FROM pg_proc WHERE proname = 'update_updated_at_column'";

const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql })
});

const data = await response.json();
if (data.length > 0) {
  console.log('✅ update_updated_at_column function exists');
} else {
  console.log('❌ update_updated_at_column function MISSING - need to create it first');
}

