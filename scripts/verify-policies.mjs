// Verify RLS policies on student_activity_log table

const projectRef = 'eidcegehaswbtzrwzvfa';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || 'sbp_26da40b93963c303358083b9131f5febe0950f16';

const sql = `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'student_activity_log' ORDER BY policyname;`;

async function run() {
  console.log('🔍 Checking policies on student_activity_log...\n');
  
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ query: sql })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Error:', data);
    return;
  }
  
  console.log('📋 Current policies:\n');
  if (data.length === 0) {
    console.log('   (no policies found)');
  } else {
    data.forEach(row => {
      console.log(`   ✅ ${row.policyname} (${row.cmd})`);
    });
  }
  
  // Check for our new admin policies
  const hasAdminView = data.some(p => p.policyname === 'admins view all activity');
  const hasAdminInsert = data.some(p => p.policyname === 'admins insert activity');
  
  console.log('\n🔐 Admin policies status:');
  console.log(`   View: ${hasAdminView ? '✅ ACTIVE' : '❌ MISSING'}`);
  console.log(`   Insert: ${hasAdminInsert ? '✅ ACTIVE' : '❌ MISSING'}`);
}

run().catch(console.error);

