import fetch from 'node-fetch';

const SUPABASE_PROJECT_REF = 'eidcegehaswbtzrwzvfa';
const SUPABASE_ACCESS_TOKEN = 'sbp_26da40b93963c303358083b9131f5febe0950f16';

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

