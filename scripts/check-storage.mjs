// Check storage files
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const query = "SELECT name, bucket_id FROM storage.objects WHERE bucket_id = 'courses' LIMIT 20";

console.log('Checking storage files...');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query })
});

const data = await res.json();
console.log('Files in courses bucket:');
if (Array.isArray(data) && data.length > 0) {
  data.forEach(f => console.log('  ', f.name));
} else {
  console.log('  (no files found)');
  console.log('  Raw:', JSON.stringify(data));
}

