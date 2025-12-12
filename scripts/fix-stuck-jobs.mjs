// Fix stuck jobs (processing status for too long)
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

// Mark jobs stuck in "processing" as failed
const query = `
  UPDATE ai_course_jobs 
  SET status = 'failed', 
      error = 'Timed out - marked as failed by cleanup script',
      completed_at = NOW()
  WHERE status = 'processing' 
    AND started_at < NOW() - INTERVAL '5 minutes'
`;

console.log('Fixing stuck jobs...');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({ query })
});

console.log('Status:', res.status);
console.log('✅ Stuck jobs cleaned up');

