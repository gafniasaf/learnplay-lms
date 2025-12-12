/**
 * Comprehensive Database Seeding Script
 * 
 * Seeds the database with complete test data for all dashboards:
 * - Game sessions, rounds, and attempts (for teacher/admin dashboards)
 * - Classes with student rosters (for teacher dashboard)
 * - Assignments with various statuses (for teacher/student dashboards)
 * - Student assignments with progress (for student/parent dashboards)
 * - Student metrics, achievements, recommendations (for student/parent dashboards)
 * 
 * Usage:
 *   npx tsx scripts/seed-complete-database.ts
 * 
 * Requires:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in learnplay.env or env vars
 *   - ORGANIZATION_ID in learnplay.env or env vars
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
  console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or ensure learnplay.env exists.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper to get or create organization ID
// Note: For seeding scripts, we intentionally find-or-create an org if not configured
async function getOrCreateOrgId(): Promise<string> {
  // Check explicit env vars first
  const configuredOrgId = process.env.ORGANIZATION_ID ?? env.ORGANIZATION_ID ?? undefined;
  
  if (configuredOrgId) {
    console.log(`✅ Using configured organization: ${configuredOrgId}`);
    return configuredOrgId;
  }
  
  console.log('⚠️  ORGANIZATION_ID not set, attempting to find or create default organization...');
  
  // Try to get first organization from database
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .limit(1);
  
  if (orgs && orgs.length > 0) {
    console.log(`✅ Using existing organization: ${orgs[0].id}`);
    return orgs[0].id;
  }
  
  // Create a default organization
  const defaultOrgId = '00000000-0000-0000-0000-000000000001';
  const { error: createError } = await supabase
    .from('organizations')
    .upsert({
      id: defaultOrgId,
      name: 'Default Test Organization',
      slug: 'default-test-org',
    }, { onConflict: 'id' });
  
  if (createError) {
    // Try without slug
    const { error: createError2 } = await supabase
      .from('organizations')
      .upsert({
        id: defaultOrgId,
        name: 'Default Test Organization',
      }, { onConflict: 'id' });
    
    if (createError2) {
      console.error('❌ Failed to create organization:', createError2.message);
      console.error('   Please set ORGANIZATION_ID environment variable');
      throw createError2;
    }
  }
  
  console.log(`✅ Created default organization: ${defaultOrgId}`);
  return defaultOrgId;
}

// Helper to get or create user
async function getOrCreateUser(email: string, password: string, name: string, role: string, orgId: string): Promise<string | null> {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users.find(u => u.email === email);
  
  if (existing) {
    // Update password
    await supabase.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { organization_id: orgId },
  });
  
  if (authError) {
    console.error(`❌ Error creating user ${email}:`, authError.message);
    return null;
  }
  
  const userId = authData?.user?.id;
  if (!userId) return null;
  
  // Create profile
  await supabase.from('profiles').upsert({
    id: userId,
    full_name: name,
    role,
  }, { onConflict: 'id' });
  
  return userId;
}

async function seedCompleteDatabase() {
  console.log('🌱 Starting comprehensive database seeding...\n');
  
  const DEFAULT_ORG_ID = await getOrCreateOrgId();

  // 1. Get or create test accounts
  console.log('👥 Setting up test accounts...');
  const teacherId = await getOrCreateUser('teacher@test.local', 'TestTeacher123!', 'Test Teacher', 'teacher', DEFAULT_ORG_ID);
  const student1Id = await getOrCreateUser('student@test.local', 'TestStudent123!', 'Test Student', 'student', DEFAULT_ORG_ID);
  const student2Id = await getOrCreateUser('student2@test.local', 'TestStudent123!', 'Test Student 2', 'student', DEFAULT_ORG_ID);
  const parentId = await getOrCreateUser('parent@test.local', 'TestParent123!', 'Test Parent', 'parent', DEFAULT_ORG_ID);
  const adminId = await getOrCreateUser('admin@test.local', 'TestAdmin123!', 'Test Admin', 'admin', DEFAULT_ORG_ID);
  
  // Link users to organization
  const userIds = [teacherId, student1Id, student2Id, parentId, adminId].filter(Boolean) as string[];
  for (const userId of userIds) {
    const { data: user } = await supabase.auth.admin.getUserById(userId);
    const role = user?.user?.user_metadata?.role || 'student';
    await supabase.from('organization_users').upsert({
      org_id: DEFAULT_ORG_ID,
      user_id: userId,
      org_role: role,
    }, { onConflict: 'org_id,user_id' });
  }
  
  if (!teacherId || !student1Id || !student2Id) {
    console.error('❌ Failed to create required users');
    process.exit(1);
  }
  
  console.log('✅ Test accounts ready\n');

  // 2. Create courses
  console.log('📚 Creating courses...');
  const courses = [
    { id: 'math-basics-001', title: 'Math Basics' },
    { id: 'science-basics-001', title: 'Science Basics' },
    { id: 'english-basics-001', title: 'English Basics' },
  ];
  
  for (const course of courses) {
    await supabase.from('course_metadata').upsert({
      id: course.id,
      organization_id: DEFAULT_ORG_ID,
      visibility: 'org',
      tag_ids: [],
      content_version: 1,
      etag: 1,
    }, { onConflict: 'id' });
  }
  console.log(`✅ Created ${courses.length} courses\n`);

  // 3. Create classes
  console.log('🏫 Creating classes...');
  const { data: class1, error: class1Error } = await supabase
    .from('classes')
    .insert({
      name: 'Math Class 101',
      description: 'Introduction to Math',
      owner: teacherId,
      org_id: DEFAULT_ORG_ID,
    })
    .select('id')
    .single();
  
  if (class1Error) {
    console.error('❌ Error creating class:', class1Error.message);
  } else {
    // Add students to class
    await supabase.from('class_members').upsert([
      { class_id: class1.id, user_id: student1Id, role: 'student' },
      { class_id: class1.id, user_id: student2Id, role: 'student' },
    ], { onConflict: 'class_id,user_id' });
    console.log('✅ Created class with students\n');
  }

  // 4. Create assignments
  console.log('📋 Creating assignments...');
  const now = new Date();
  const assignments = [
    {
      title: 'Math Quiz 1',
      course_id: courses[0].id,
      due_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    },
    {
      title: 'Science Homework',
      course_id: courses[1].id,
      due_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
    },
    {
      title: 'English Essay',
      course_id: courses[2].id,
      due_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago (overdue)
    },
    {
      title: 'Math Quiz 2',
      course_id: courses[0].id,
      due_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    },
  ];
  
  const assignmentIds: string[] = [];
  for (const assignment of assignments) {
    const { data: assignmentData, error: assignmentError } = await supabase
      .from('assignments')
      .insert({
        org_id: DEFAULT_ORG_ID,
        course_id: assignment.course_id,
        title: assignment.title,
        due_at: assignment.due_at,
        created_by: teacherId,
      })
      .select('id')
      .single();
    
    if (!assignmentError && assignmentData) {
      assignmentIds.push(assignmentData.id);
      
      // Link to students
      await supabase.from('assignment_assignees').insert([
        { assignment_id: assignmentData.id, assignee_type: 'student', user_id: student1Id },
        { assignment_id: assignmentData.id, assignee_type: 'student', user_id: student2Id },
      ]);
    }
  }
  console.log(`✅ Created ${assignmentIds.length} assignments\n`);

  // 5. Create student assignments with progress
  console.log('📝 Creating student assignments...');
  const studentAssignments = [
    { studentId: student1Id, assignmentId: assignmentIds[0], status: 'in_progress', progress_pct: 45 },
    { studentId: student1Id, assignmentId: assignmentIds[1], status: 'in_progress', progress_pct: 30 },
    { studentId: student1Id, assignmentId: assignmentIds[2], status: 'not_started', progress_pct: 0 },
    { studentId: student1Id, assignmentId: assignmentIds[3], status: 'not_started', progress_pct: 0 },
    { studentId: student2Id, assignmentId: assignmentIds[0], status: 'completed', progress_pct: 100 },
    { studentId: student2Id, assignmentId: assignmentIds[1], status: 'in_progress', progress_pct: 60 },
    { studentId: student2Id, assignmentId: assignmentIds[2], status: 'completed', progress_pct: 100 },
  ];
  
  for (const sa of studentAssignments) {
    const assignment = assignments.find(a => assignmentIds.indexOf(sa.assignmentId) !== -1);
    if (!assignment) continue;
    
    await supabase.from('student_assignments').upsert({
      student_id: sa.studentId,
      course_id: assignment.course_id,
      title: assignment.title,
      due_at: assignment.due_at,
      status: sa.status,
      progress_pct: sa.progress_pct,
      assignment_id: sa.assignmentId,
    }, { onConflict: 'student_id,assignment_id' });
  }
  console.log(`✅ Created ${studentAssignments.length} student assignments\n`);

  // 6. Create student metrics
  console.log('📊 Creating student metrics...');
  await supabase.from('student_metrics').upsert([
    {
      student_id: student1Id,
      xp_total: 1250,
      streak_days: 5,
    },
    {
      student_id: student2Id,
      xp_total: 2100,
      streak_days: 12,
    },
  ], { onConflict: 'student_id' });
  console.log('✅ Created student metrics\n');

  // 7. Create game sessions, rounds, and attempts (for teacher/admin dashboards)
  console.log('🎮 Creating game activity...');
  
  // Create sessions for teacher (to show in teacher dashboard)
  const sessionIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const sessionDate = new Date(now.getTime() - i * 2 * 24 * 60 * 60 * 1000); // Spread over 16 days
    const { data: sessionData, error: sessionError } = await supabase
      .from('game_sessions')
      .insert({
        user_id: teacherId,
        course_id: courses[i % courses.length].id,
        started_at: sessionDate.toISOString(),
        ended_at: new Date(sessionDate.getTime() + 30 * 60 * 1000).toISOString(), // 30 min session
      })
      .select('id')
      .single();
    
    if (!sessionError && sessionData) {
      sessionIds.push(sessionData.id);
      
      // Create rounds for each session
      const roundIds: string[] = [];
      for (let j = 0; j < 3; j++) {
        const { data: roundData, error: roundError } = await supabase
          .from('game_rounds')
          .insert({
            session_id: sessionData.id,
            level: j + 1,
            started_at: new Date(sessionDate.getTime() + j * 10 * 60 * 1000).toISOString(),
            ended_at: new Date(sessionDate.getTime() + (j + 1) * 10 * 60 * 1000).toISOString(),
            base_score: 50 + j * 10,
            final_score: 80 + j * 5,
            mistakes: j,
            distinct_items: 10 + j * 2,
            elapsed_seconds: 600,
          })
          .select('id')
          .single();
        
        if (!roundError && roundData) {
          roundIds.push(roundData.id);
          
          // Create attempts for each round (some within last 7 days for attempts7d stat)
          const attemptDate = new Date(sessionDate.getTime() + j * 10 * 60 * 1000);
          const isWithin7Days = (now.getTime() - attemptDate.getTime()) < 7 * 24 * 60 * 60 * 1000;
          
          if (isWithin7Days || i < 2) { // Ensure some recent attempts
            for (let k = 0; k < 5; k++) {
              await supabase.from('game_attempts').insert({
                round_id: roundData.id,
                item_id: k + 1,
                item_key: `0:${courses[i % courses.length].id}:${k + 1}`,
                selected_index: k % 4,
                correct: k % 2 === 0,
                latency_ms: 2000 + k * 500,
                created_at: attemptDate.toISOString(),
              });
            }
          }
        }
      }
    }
  }
  console.log(`✅ Created ${sessionIds.length} game sessions with rounds and attempts\n`);

  // 8. Create student achievements
  console.log('🏆 Creating student achievements...');
  await supabase.from('student_achievements').upsert([
    {
      student_id: student1Id,
      achievement_type: 'streak',
      title: 'Week Warrior',
      description: 'Completed 5 days in a row',
      earned_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      student_id: student2Id,
      achievement_type: 'xp',
      title: 'XP Master',
      description: 'Earned 2000+ XP',
      earned_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ], { onConflict: 'student_id,achievement_type' });
  console.log('✅ Created student achievements\n');

  // 9. Create student recommendations
  console.log('💡 Creating student recommendations...');
  await supabase.from('student_recommendations').upsert([
    {
      student_id: student1Id,
      course_id: courses[2].id,
      reason: 'Based on your progress in Math, you might enjoy English',
      created_at: new Date().toISOString(),
    },
    {
      student_id: student2Id,
      course_id: courses[0].id,
      reason: 'Continue practicing Math to improve your skills',
      created_at: new Date().toISOString(),
    },
  ], { onConflict: 'student_id,course_id' });
  console.log('✅ Created student recommendations\n');

  console.log('🎉 Comprehensive database seeding complete!');
  console.log('\n📝 Summary:');
  console.log(`   - Courses: ${courses.length}`);
  console.log(`   - Classes: 1`);
  console.log(`   - Assignments: ${assignmentIds.length}`);
  console.log(`   - Student Assignments: ${studentAssignments.length}`);
  console.log(`   - Game Sessions: ${sessionIds.length}`);
  console.log(`   - Student Metrics: 2`);
  console.log(`   - Student Achievements: 2`);
  console.log(`   - Student Recommendations: 2`);
  console.log('\n🔑 Test Accounts:');
  console.log('   - teacher@test.local / TestTeacher123!');
  console.log('   - student@test.local / TestStudent123!');
  console.log('   - student2@test.local / TestStudent123!');
  console.log('   - parent@test.local / TestParent123!');
  console.log('   - admin@test.local / TestAdmin123!');
  console.log(`\n🌐 Organization ID: ${DEFAULT_ORG_ID}`);
}

seedCompleteDatabase().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});

