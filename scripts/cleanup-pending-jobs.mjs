// Clean up old pending smoke-test jobs and check remaining
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

// Delete all pending smoke-test jobs
const deleteQuery = "UPDATE ai_course_jobs SET status = 'cancelled' WHERE status = 'pending' AND subject = 'smoke-test'";

console.log('Cancelling pending smoke-test jobs...');

let res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query: deleteQuery })
});

console.log('Cancel status:', res.status);

// Check remaining pending jobs
const countQuery = "SELECT id, subject, status FROM ai_course_jobs WHERE status = 'pending' LIMIT 10";

res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query: countQuery })
});

const data = await res.json();
console.log('Remaining pending jobs:');
if (Array.isArray(data) && data.length > 0) {
  data.forEach(j => console.log('  ', j.id?.substring(0,8), '|', j.subject, '|', j.status));
} else {
  console.log('  (no pending jobs)');
}

