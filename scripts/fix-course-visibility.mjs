// Fix course visibility and organization_id
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const correctOrgId = '4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58';

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const query = `UPDATE course_metadata SET visibility = 'global', organization_id = '${correctOrgId}' WHERE visibility = 'org' OR organization_id = '00000000-0000-0000-0000-000000000001'`;

console.log('Executing:', query);

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query })
});

console.log('Status:', res.status);
const text = await res.text();
console.log('Response:', text);

