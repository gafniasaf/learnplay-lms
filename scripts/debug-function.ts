const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !AGENT_TOKEN || !ORGANIZATION_ID) {
  console.error("❌ Required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, AGENT_TOKEN, ORGANIZATION_ID");
  process.exit(1);
}

async function testFunction(name: string, queryParams: Record<string, string>) {
  console.log(`\n=== Testing ${name} ===`);
  const params = new URLSearchParams(queryParams).toString();
  const url = `${SUPABASE_URL}/functions/v1/${name}${params ? '?' + params : ''}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'x-agent-token': AGENT_TOKEN,
        'x-organization-id': ORGANIZATION_ID
      }
    });
    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${text.slice(0, 300)}`);
  } catch (e: any) {
    console.log(`Exception:`, e.message);
  }
}

async function main() {
  await testFunction('student-achievements', { studentId: '00000000-0000-0000-0000-000000000000' });
  await testFunction('list-courses', { limit: '1' });
  await testFunction('student-dashboard', { studentId: '00000000-0000-0000-0000-000000000000' });
}

main().catch(console.error);

