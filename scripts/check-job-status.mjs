// Check job status
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const query = "SELECT id, subject, status, error, created_at FROM ai_course_jobs ORDER BY created_at DESC LIMIT 10";

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query })
});

const data = await res.json();
console.log('Recent jobs:');
if (Array.isArray(data)) {
  data.forEach(j => {
    const err = j.error ? ` | err: ${j.error.substring(0, 50)}...` : '';
    console.log('  ', j.id?.substring(0,8), '|', j.status?.padEnd(10), '|', j.subject, err);
  });
} else {
  console.log('Raw:', JSON.stringify(data));
}

