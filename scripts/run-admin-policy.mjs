// Run admin RLS policy SQL directly
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://eidcegehaswbtzrwzvfa.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

console.log('🔗 Connecting to:', supabaseUrl);
console.log('🔑 Using service role key (first 20 chars):', serviceRoleKey.substring(0, 20) + '...');

const supabase = createClient(supabaseUrl, serviceRoleKey);

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
  console.log('🚀 Executing SQL...');
  
  // Use the rpc function to run raw SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    // If exec_sql doesn't exist, try an alternative approach
    console.log('⚠️  exec_sql RPC not available, trying alternative...');
    
    // Try running individual statements via the REST API
    const statements = [
      `DROP POLICY IF EXISTS "admins view all activity" ON public.student_activity_log`,
      `DROP POLICY IF EXISTS "admins insert activity" ON public.student_activity_log`,
      `CREATE POLICY "admins view all activity" ON public.student_activity_log FOR SELECT USING (EXISTS (SELECT 1 FROM organization_users WHERE user_id = auth.uid() AND org_role = 'admin'))`,
      `CREATE POLICY "admins insert activity" ON public.student_activity_log FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM organization_users WHERE user_id = auth.uid() AND org_role = 'admin'))`
    ];
    
    for (const stmt of statements) {
      console.log(`   Executing: ${stmt.substring(0, 60)}...`);
      
      // Use the Supabase SQL endpoint directly
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({ sql_query: stmt })
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.log(`   ⚠️  Response: ${response.status} - ${text.substring(0, 100)}`);
      }
    }
    
    console.log('\n📋 If the above failed, please run the SQL manually in Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/eidcegehaswbtzrwzvfa/sql/new');
    console.log('\n' + sql);
    return;
  }
  
  console.log('✅ SQL executed successfully!');
  console.log('Result:', data);
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

