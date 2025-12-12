// Run admin RLS policy SQL via Supabase Management API
// Requires SUPABASE_ACCESS_TOKEN (personal access token)

const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || 'sbp_26da40b93963c303358083b9131f5febe0950f16';

const sql = `
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admins view all activity" ON public.student_activity_log;
DROP POLICY IF EXISTS "admins insert activity" ON public.student_activity_log;

-- Create view policy for admins
CREATE POLICY "admins view all activity"
ON public.student_activity_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND org_role = 'admin'
  )
);

-- Create insert policy for admins
CREATE POLICY "admins insert activity"
ON public.student_activity_log
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND org_role = 'admin'
  )
);
`;

async function run() {
  console.log('🔗 Project:', projectRef);
  console.log('🔑 Using access token (first 20 chars):', accessToken.substring(0, 20) + '...');
  console.log('🚀 Executing SQL via Management API...\n');
  
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ query: sql })
  });
  
  const text = await response.text();
  
  if (!response.ok) {
    console.error('❌ API Error:', response.status, response.statusText);
    console.error('   Response:', text);
    
    // If the API doesn't work, fall back to instructions
    console.log('\n📋 Please run the SQL manually in Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/eidcegehaswbtzrwzvfa/sql/new\n');
    console.log(sql);
    process.exit(1);
  }
  
  console.log('✅ SQL executed successfully!');
  
  try {
    const result = JSON.parse(text);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch {
    console.log('Response:', text);
  }
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

