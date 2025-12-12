// Delete all smoke-test jobs
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

// Delete all smoke-test jobs
const deleteQuery = "DELETE FROM ai_course_jobs WHERE subject = 'smoke-test'";

console.log('Deleting smoke-test jobs...');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query: deleteQuery })
});

console.log('Status:', res.status);
const text = await res.text();
console.log('Response:', text);

