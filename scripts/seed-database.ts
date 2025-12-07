/**
 * Database Seeding Script
 * 
 * Seeds the database with:
 * - Courses (with items, groups, levels)
 * - Students (with profiles, metrics)
 * - Teachers (with profiles)
 * - Parents (with profiles, linked to students)
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

const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

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

// Default organization ID (from learnplay.env or use default)
const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID || '4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58';

interface CourseData {
  id: string;
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

  // 2. Create courses
  console.log('📚 Creating courses...');
  const courses: CourseData[] = [
    {
      id: 'math-basics-001',
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
    {
      id: 'science-basics-001',
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
  ];

  for (const course of courses) {
    // Store course JSON in storage (if using JSON storage pattern)
    // For now, store in course_metadata table
    const { error: courseError } = await supabase
      .from('course_metadata')
      .upsert({
        id: course.id,
        title: course.title,
        description: course.description,
        grade_band: course.grade_band,
        organization_id: DEFAULT_ORG_ID,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (courseError) {
      console.error(`❌ Error creating course ${course.id}:`, courseError.message);
    } else {
      console.log(`✅ Created course: ${course.title}`);
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
        name: user.name,
        organization_id: DEFAULT_ORG_ID,
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

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        role: user.role,
        organization_id: DEFAULT_ORG_ID,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error(`❌ Error creating profile for ${user.email}:`, profileError.message);
    } else {
      console.log(`✅ Created ${user.role}: ${user.name} (${user.email})`);
    }
  }
  console.log('');

  // 4. Create student metrics
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
        organization_id: DEFAULT_ORG_ID,
      }, { onConflict: 'student_id' });

    if (metricsError) {
      console.error(`❌ Error creating metrics for ${student.email}:`, metricsError.message);
    } else {
      console.log(`✅ Created metrics for ${student.name}`);
    }
  }
  console.log('');

  // 5. Create assignments
  console.log('📋 Creating assignments...');
  const teacherId = userIds[teachers[0].email];
  if (teacherId) {
    const { data: assignmentData, error: assignmentError } = await supabase
      .from('assignments')
      .insert({
        title: 'Math Homework Week 1',
        description: 'Complete exercises 1-10',
        course_id: courses[0].id,
        teacher_id: teacherId,
        due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        organization_id: DEFAULT_ORG_ID,
      })
      .select('id')
      .single();

    if (assignmentError) {
      console.error('❌ Error creating assignment:', assignmentError.message);
    } else {
      console.log('✅ Created assignment: Math Homework Week 1');

      // Link assignments to students
      for (const student of students) {
        const studentId = userIds[student.email];
        if (!studentId) continue;

        const { error: linkError } = await supabase
          .from('student_assignments')
          .insert({
            student_id: studentId,
            assignment_id: assignmentData.id,
            status: 'pending',
            organization_id: DEFAULT_ORG_ID,
          });

        if (linkError) {
          console.error(`❌ Error linking assignment to ${student.email}:`, linkError.message);
        } else {
          console.log(`✅ Linked assignment to ${student.name}`);
        }
      }
    }
  }
  console.log('');

  // 6. Link parents to students
  console.log('👨‍👩‍👧 Linking parents to students...');
  for (let i = 0; i < parents.length && i < students.length; i++) {
    const parentId = userIds[parents[i].email];
    const studentId = userIds[students[i].email];
    if (!parentId || !studentId) continue;

    const { error: linkError } = await supabase
      .from('parent_student_links')
      .upsert({
        parent_id: parentId,
        student_id: studentId,
        organization_id: DEFAULT_ORG_ID,
      }, { onConflict: 'parent_id,student_id' });

    if (linkError) {
      console.error(`❌ Error linking parent to student:`, linkError.message);
    } else {
      console.log(`✅ Linked ${parents[i].name} to ${students[i].name}`);
    }
  }
  console.log('');

  console.log('🎉 Database seeding complete!');
  console.log('\n📝 Summary:');
  console.log(`   - Courses: ${courses.length}`);
  console.log(`   - Students: ${students.length}`);
  console.log(`   - Teachers: ${teachers.length}`);
  console.log(`   - Parents: ${parents.length}`);
  console.log('\n🔑 Default password for all users: DemoPass123!');
}

seedDatabase().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});

