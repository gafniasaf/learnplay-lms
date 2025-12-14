// Setup pg_cron job for processing pending AI jobs
// NOTE: This script must NOT hardcode any keys/tokens.
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID;

if (!SUPABASE_URL) {
  console.error('❌ Set SUPABASE_URL (or VITE_SUPABASE_URL)');
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF || new URL(SUPABASE_URL).hostname.split('.')[0];

if (!accessToken) {
  console.error('❌ Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Set SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY)');
  process.exit(1);
}

if (!AGENT_TOKEN) {
  console.error('❌ Set AGENT_TOKEN env var');
  process.exit(1);
}

const functionUrl = `${SUPABASE_URL}/functions/v1/process-pending-jobs`;
const headersJson = JSON.stringify({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'x-agent-token': AGENT_TOKEN,
  ...(ORGANIZATION_ID ? { 'x-organization-id': ORGANIZATION_ID } : {}),
});

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
      url := '${functionUrl}',
      headers := '${headersJson.replaceAll("'", "''")}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
    $$
  );`
];

for (const query of queries) {
  // Avoid printing full SQL since it can contain sensitive headers.
  console.log('Executing query...');
  
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

