// Remove course metadata entries with no storage content
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const query = "DELETE FROM course_metadata WHERE id = 'english-basics-001'";

console.log('Cleaning up orphan course metadata...');

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
console.log('✅ Done!');

