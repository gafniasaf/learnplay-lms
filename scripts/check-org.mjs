import fetch from 'node-fetch';

const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error("Missing env: SUPABASE_PROJECT_REF and/or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const sql = "SELECT DISTINCT organization_id FROM entity_records LIMIT 5";

fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql })
}).then(async r => {
  console.log('Status:', r.status);
  const data = await r.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}).catch(e => console.log('Error:', e.message));

