/**
 * Database Seeding Script
 * 
 * Seeds the database with:
 * - Courses (course_metadata entries + JSON files in storage)
 * - Students (with profiles, organization_users, metrics)
 * - Teachers (with profiles, organization_users)
 * - Parents (with profiles, organization_users, linked to students via org)
 * - Assignments (for students)
 * - Student assignments (linking students to assignments)
 * 
 * Usage:
 *   npx tsx scripts/seed-database.ts
 * 
 * Requires:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in learnplay.env or env vars
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = parseLearnPlayEnv();

const SUPABASE_URL = process.env.SUPABASE_URL ? process.env.SUPABASE_URL : env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are REQUIRED');
  process.exit(1);
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

// Organization ID (from env)
const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID;
if (!DEFAULT_ORG_ID) {
  console.error('❌ ORGANIZATION_ID is REQUIRED - set env var');
  process.exit(1);
}

interface CourseJSON {
  title: string;
  description: string;
  grade_band: string;
  levels: Array<{
    level: number;
    groups: Array<{
      group: number;
      items: Array<{
        stem: string;
        options?: string[];
        correct_answer: string | number;
        explanation: string;
      }>;
    }>;
  }>;
}

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  // 1. Ensure organization exists
  console.log('📝 Ensuring organization exists...');
  // Check if organizations table has slug column
  const { error: orgError } = await supabase
    .from('organizations')
    .upsert({
      id: DEFAULT_ORG_ID,
      name: 'LearnPlay Demo Organization',
      slug: 'learnplay-demo',
    }, { onConflict: 'id' });

  if (orgError) {
    console.error('❌ Error creating organization:', orgError.message);
    process.exit(1);
  }
  console.log('✅ Organization ready\n');

  // 2. Create courses (course_metadata + JSON in storage)
  console.log('📚 Creating courses...');
  const courses: Array<{ id: string; json: CourseJSON }> = [
    {
      id: 'math-basics-001',
      json: {
        title: 'Math Basics',
        description: 'Introduction to basic math concepts',
        grade_band: '3-5',
        levels: [
          {
            level: 1,
            groups: [
              {
                group: 1,
                items: [
                  {
                    stem: 'What is 2 + 2?',
                    options: ['3', '4', '5', '6'],
                    correct_answer: '4',
                    explanation: '2 + 2 equals 4',
                  },
                  {
                    stem: 'What is 5 - 3?',
                    options: ['1', '2', '3', '4'],
                    correct_answer: '2',
                    explanation: '5 - 3 equals 2',
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      id: 'science-basics-001',
      json: {
        title: 'Science Basics',
        description: 'Introduction to basic science concepts',
        grade_band: '3-5',
        levels: [
          {
            level: 1,
            groups: [
              {
                group: 1,
                items: [
                  {
                    stem: 'What is the process by which plants make food?',
                    options: ['Respiration', 'Photosynthesis', 'Digestion', 'Circulation'],
                    correct_answer: 'Photosynthesis',
                    explanation: 'Plants use photosynthesis to convert sunlight into food',
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ];

  for (const course of courses) {
    // Create course_metadata entry
    const { error: courseError } = await supabase
      .from('course_metadata')
      .upsert({
        id: course.id,
        organization_id: DEFAULT_ORG_ID,
        visibility: 'org',
        tag_ids: [],
        content_version: 1,
        etag: 1,
      }, { onConflict: 'id' });

    if (courseError) {
      console.error(`❌ Error creating course metadata ${course.id}:`, courseError.message);
    } else {
      // Upload course JSON to storage (courses bucket)
      const { error: storageError } = await supabase.storage
        .from('courses')
        .upload(`${course.id}.json`, JSON.stringify(course.json), {
          contentType: 'application/json',
          upsert: true,
        });

      if (storageError) {
        console.error(`⚠️  Could not upload course JSON for ${course.id}:`, storageError.message);
        console.log(`✅ Created course metadata: ${course.json.title} (${course.id})`);
      } else {
        console.log(`✅ Created course: ${course.json.title} (${course.id})`);
      }
    }
  }
  console.log('');

  // 3. Create users (students, teachers, parents)
  console.log('👥 Creating users...');
  
  // Students
  const students = [
    { email: 'student1@demo.learnplay.dev', name: 'Alice Student', role: 'student' },
    { email: 'student2@demo.learnplay.dev', name: 'Bob Student', role: 'student' },
  ];

  // Teachers
  const teachers = [
    { email: 'teacher1@demo.learnplay.dev', name: 'Ms. Smith', role: 'teacher' },
    { email: 'teacher2@demo.learnplay.dev', name: 'Mr. Jones', role: 'teacher' },
  ];

  // Parents
  const parents = [
    { email: 'parent1@demo.learnplay.dev', name: 'Parent One', role: 'parent' },
    { email: 'parent2@demo.learnplay.dev', name: 'Parent Two', role: 'parent' },
  ];

  const allUsers = [...students, ...teachers, ...parents];
  const userIds: Record<string, string> = {};

  for (const user of allUsers) {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'DemoPass123!',
      email_confirm: true,
      user_metadata: {
        full_name: user.name,
      },
      app_metadata: {
        organization_id: DEFAULT_ORG_ID,
      },
    });

    if (authError && !authError.message.includes('already registered')) {
      console.error(`❌ Error creating user ${user.email}:`, authError.message);
      continue;
    }

    const userId = authData?.user?.id;
    if (!userId) {
      // User might already exist, try to find them
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users.find(u => u.email === user.email);
      if (existing) {
        userIds[user.email] = existing.id;
        console.log(`ℹ️  User already exists: ${user.email}`);
        continue;
      }
      console.error(`❌ Could not create or find user: ${user.email}`);
      continue;
    }

    userIds[user.email] = userId;

    // Create profile (no organization_id column)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: user.name,
        role: user.role,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error(`❌ Error creating profile for ${user.email}:`, profileError.message);
    } else {
      // Add to organization_users (this links user to org)
      const { error: orgUserError } = await supabase
        .from('organization_users')
        .upsert({
          org_id: DEFAULT_ORG_ID,
          user_id: userId,
          org_role: user.role === 'student' ? 'student' : user.role === 'teacher' ? 'teacher' : 'parent',
        }, { onConflict: 'org_id,user_id' });

      if (orgUserError) {
        console.error(`❌ Error adding ${user.email} to organization:`, orgUserError.message);
      } else {
        console.log(`✅ Created ${user.role}: ${user.name} (${user.email})`);
      }
    }
  }
  console.log('');

  // 4. Create student metrics (no organization_id column)
  console.log('📊 Creating student metrics...');
  for (const student of students) {
    const studentId = userIds[student.email];
    if (!studentId) continue;

    const { error: metricsError } = await supabase
      .from('student_metrics')
      .upsert({
        student_id: studentId,
        xp_total: Math.floor(Math.random() * 1000),
        streak_days: Math.floor(Math.random() * 30),
      }, { onConflict: 'student_id' });

    if (metricsError) {
      console.error(`❌ Error creating metrics for ${student.email}:`, metricsError.message);
    } else {
      console.log(`✅ Created metrics for ${student.name}`);
    }
  }
  console.log('');

  // 5. Create assignments (using org_id, not organization_id)
  console.log('📋 Creating assignments...');
  const teacherId = userIds[teachers[0].email];
  if (teacherId) {
    const { data: assignmentData, error: assignmentError } = await supabase
      .from('assignments')
      .insert({
        org_id: DEFAULT_ORG_ID,
        course_id: courses[0].id,
        title: 'Math Homework Week 1',
        due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        created_by: teacherId,
      })
      .select('id')
      .single();

    if (assignmentError) {
      console.error('❌ Error creating assignment:', assignmentError.message);
    } else {
      console.log('✅ Created assignment: Math Homework Week 1');

      // Link assignments to students via assignment_assignees
      for (const student of students) {
        const studentId = userIds[student.email];
        if (!studentId) continue;

        const { error: assigneeError } = await supabase
          .from('assignment_assignees')
          .insert({
            assignment_id: assignmentData.id,
            assignee_type: 'student',
            user_id: studentId,
          });

        if (assigneeError) {
          console.error(`❌ Error linking assignment to ${student.email}:`, assigneeError.message);
        } else {
          // Also create student_assignments entry
          const { error: studentAssignError } = await supabase
            .from('student_assignments')
            .insert({
              student_id: studentId,
              course_id: courses[0].id,
              title: 'Math Homework Week 1',
              due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'not_started',
              progress_pct: 0,
              assignment_id: assignmentData.id,
            });

          if (studentAssignError) {
            console.error(`⚠️  Could not create student_assignment for ${student.email}:`, studentAssignError.message);
          } else {
            console.log(`✅ Linked assignment to ${student.name}`);
          }
        }
      }
    }
  }
  console.log('');

  // 6. Parents are already linked to students via organization_users (same org)
  console.log('👨‍👩‍👧 Parents and students are linked via organization (same org_id)');
  console.log('');

  console.log('🎉 Database seeding complete!');
  console.log('\n📝 Summary:');
  console.log(`   - Courses: ${courses.length}`);
  console.log(`   - Students: ${students.length}`);
  console.log(`   - Teachers: ${teachers.length}`);
  console.log(`   - Parents: ${parents.length}`);
  console.log('\n🔑 Default password for all users: DemoPass123!');
  console.log(`\n🌐 Organization ID: ${DEFAULT_ORG_ID}`);
}

seedDatabase().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});
