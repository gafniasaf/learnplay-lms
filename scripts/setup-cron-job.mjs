// Setup pg_cron job for processing pending AI jobs
const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const queries = [
  // Enable pg_cron extension
  "CREATE EXTENSION IF NOT EXISTS pg_cron;",
  
  // Enable pg_net extension for HTTP calls
  "CREATE EXTENSION IF NOT EXISTS pg_net;",
  
  // Remove old cron job if exists
  "SELECT cron.unschedule('process-pending-jobs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-jobs');",
  
  // Schedule new cron job - every 2 minutes to avoid overload
  `SELECT cron.schedule(
    'process-pending-jobs',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://eidcegehaswbtzrwzvfa.supabase.co/functions/v1/process-pending-jobs',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDYzNTAsImV4cCI6MjA4MDQyMjM1MH0.DpXOHjccnVEewnPF5gA6tw27TcRXkkAfgrJkn0NvT_Q", "x-agent-token": "learnplay-agent-token"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
    $$
  );`
];

for (const query of queries) {
  console.log('Executing:', query.substring(0, 60) + '...');
  
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
  if (text && !text.startsWith('[]')) {
    console.log('Response:', text.substring(0, 200));
  }
}

console.log('✅ Cron job setup complete!');

