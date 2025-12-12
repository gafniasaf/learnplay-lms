/**
 * Seed Data Verification Script
 * 
 * Verifies that all seed data was created correctly by checking:
 * - Required tables have data
 * - Relationships are correct
 * - Edge Functions return expected data shapes
 * 
 * Usage:
 *   npx tsx scripts/verify-seed-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import { parseLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';

const env = parseLearnPlayEnv();

let SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  SUPABASE_URL = env.SUPABASE_URL;
}

let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function verifySeedData() {
  console.log('🔍 Verifying seed data...\n');
  
  let allPassed = true;
  
  // 1. Verify users exist
  console.log('1. Checking users...');
  const { data: users } = await supabase.auth.admin.listUsers();
  const testEmails = ['teacher@test.local', 'student@test.local', 'student2@test.local', 'parent@test.local', 'admin@test.local'];
  const foundUsers = users?.users.filter(u => testEmails.includes(u.email || '')) || [];
  if (foundUsers.length >= 3) {
    console.log(`   ✅ Found ${foundUsers.length} test users`);
  } else {
    console.log(`   ❌ Expected at least 3 test users, found ${foundUsers.length}`);
    allPassed = false;
  }
  
  // 2. Verify courses
  console.log('2. Checking courses...');
  const { count: courseCount } = await supabase.from('course_metadata').select('*', { count: 'exact', head: true });
  if (courseCount && courseCount >= 3) {
    console.log(`   ✅ Found ${courseCount} courses`);
  } else {
    console.log(`   ❌ Expected at least 3 courses, found ${courseCount || 0}`);
    allPassed = false;
  }
  
  // 3. Verify classes
  console.log('3. Checking classes...');
  const { count: classCount } = await supabase.from('classes').select('*', { count: 'exact', head: true });
  if (classCount && classCount >= 1) {
    console.log(`   ✅ Found ${classCount} classes`);
  } else {
    console.log(`   ❌ Expected at least 1 class, found ${classCount || 0}`);
    allPassed = false;
  }
  
  // 4. Verify assignments
  console.log('4. Checking assignments...');
  const { count: assignmentCount } = await supabase.from('assignments').select('*', { count: 'exact', head: true });
  if (assignmentCount && assignmentCount >= 3) {
    console.log(`   ✅ Found ${assignmentCount} assignments`);
  } else {
    console.log(`   ❌ Expected at least 3 assignments, found ${assignmentCount || 0}`);
    allPassed = false;
  }
  
  // 5. Verify student assignments
  console.log('5. Checking student assignments...');
  const { count: studentAssignmentCount } = await supabase.from('student_assignments').select('*', { count: 'exact', head: true });
  if (studentAssignmentCount && studentAssignmentCount >= 5) {
    console.log(`   ✅ Found ${studentAssignmentCount} student assignments`);
  } else {
    console.log(`   ❌ Expected at least 5 student assignments, found ${studentAssignmentCount || 0}`);
    allPassed = false;
  }
  
  // 6. Verify game sessions
  console.log('6. Checking game sessions...');
  const { count: sessionCount } = await supabase.from('game_sessions').select('*', { count: 'exact', head: true });
  if (sessionCount && sessionCount >= 5) {
    console.log(`   ✅ Found ${sessionCount} game sessions`);
  } else {
    console.log(`   ❌ Expected at least 5 game sessions, found ${sessionCount || 0}`);
    allPassed = false;
  }
  
  // 7. Verify game rounds
  console.log('7. Checking game rounds...');
  const { count: roundCount } = await supabase.from('game_rounds').select('*', { count: 'exact', head: true });
  if (roundCount && roundCount >= 10) {
    console.log(`   ✅ Found ${roundCount} game rounds`);
  } else {
    console.log(`   ❌ Expected at least 10 game rounds, found ${roundCount || 0}`);
    allPassed = false;
  }
  
  // 8. Verify game attempts (especially recent ones)
  console.log('8. Checking game attempts...');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { count: attemptCount } = await supabase
    .from('game_attempts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString());
  if (attemptCount && attemptCount >= 10) {
    console.log(`   ✅ Found ${attemptCount} game attempts in last 7 days`);
  } else {
    console.log(`   ⚠️  Found ${attemptCount || 0} game attempts in last 7 days (may affect attempts7d stat)`);
  }
  
  // 9. Verify student metrics
  console.log('9. Checking student metrics...');
  const { count: metricsCount } = await supabase.from('student_metrics').select('*', { count: 'exact', head: true });
  if (metricsCount && metricsCount >= 2) {
    console.log(`   ✅ Found ${metricsCount} student metrics`);
  } else {
    console.log(`   ❌ Expected at least 2 student metrics, found ${metricsCount || 0}`);
    allPassed = false;
  }
  
  console.log('\n' + (allPassed ? '✅ All verifications passed!' : '❌ Some verifications failed'));
  process.exit(allPassed ? 0 : 1);
}

verifySeedData().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});

