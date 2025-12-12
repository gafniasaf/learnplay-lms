// Test enqueue-job Edge Function

const SUPABASE_URL = 'https://eidcegehaswbtzrwzvfa.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDYzNTAsImV4cCI6MjA4MDQyMjM1MH0.DpXOHjccnVEewnPF5gA6tw27TcRXkkAfgrJkn0NvT_Q';
const AGENT_TOKEN = 'learnplay-agent-token';
const ORG_ID = '4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58';

async function test() {
  console.log('🧪 Testing enqueue-job with agent token...\n');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'x-agent-token': AGENT_TOKEN,
      'x-organization-id': ORG_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      jobType: 'smoke-test', 
      payload: { test: true } 
    })
  });
  
  console.log('Status:', response.status);
  console.log('Headers:');
  response.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));
  
  const text = await response.text();
  console.log('\nBody:', text);
  
  if (response.ok) {
    console.log('\n✅ enqueue-job is working!');
  } else {
    console.log('\n❌ enqueue-job failed');
  }
}

test().catch(console.error);

