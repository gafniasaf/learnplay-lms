const SUPABASE_PROJECT_REF = 'eidcegehaswbtzrwzvfa';
const SUPABASE_ACCESS_TOKEN = 'sbp_26da40b93963c303358083b9131f5febe0950f16';

const sql = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'course_metadata' ORDER BY ordinal_position`;

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
  console.log('Columns:', JSON.stringify(data, null, 2));
}).catch(e => console.log('Error:', e.message));


