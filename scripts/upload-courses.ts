#!/usr/bin/env tsx
/**
 * Upload course files to Supabase Storage
 * 
 * Usage:
 *   npx tsx scripts/upload-courses.ts verbs modals
 * 
 * Requirements:
 *   - Admin credentials in .env (VITE_SUPABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD)
 *   - Course JSON files in public/mock/courses/
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL not found in environment');
  process.exit(1);
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD required in environment');
  console.error('   Add them to your .env file or pass as environment variables');
  process.exit(1);
}

async function login(): Promise<string> {
  console.log('🔐 Authenticating...');
  
  const authUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!PUBLISHABLE_KEY) {
    console.error('❌ VITE_SUPABASE_PUBLISHABLE_KEY is REQUIRED - set env var before running');
    process.exit(1);
  }

  const authRes = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  if (!authRes.ok) {
    const error = await authRes.text();
    throw new Error(`Authentication failed: ${error}`);
  }

  const authData = await authRes.json();
  console.log('✓ Authenticated');
  return authData.access_token;
}

async function uploadCourse(courseId: string, token: string): Promise<void> {
  console.log(`\n📤 Uploading ${courseId}...`);
  
  // Read course file
  const coursePath = join(process.cwd(), 'public', 'mock', 'courses', `${courseId}.json`);
  let courseData;
  
  try {
    const fileContent = readFileSync(coursePath, 'utf-8');
    courseData = JSON.parse(fileContent);
  } catch (err) {
    throw new Error(`Failed to read ${coursePath}: ${err}`);
  }

  console.log(`  Course: ${courseData.title}`);
  console.log(`  Version: ${courseData.contentVersion}`);
  console.log(`  Items: ${courseData.items?.length || 0}`);
  console.log(`  Groups: ${courseData.groups?.length || 0}`);

  // Upload via author-course edge function
  const uploadUrl = `${SUPABASE_URL}/functions/v1/author-course`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(courseData),
  });

  if (!uploadRes.ok) {
    const error = await uploadRes.text();
    throw new Error(`Upload failed: ${error}`);
  }

  const result = await uploadRes.json();
  console.log(`✓ Uploaded to Storage: ${result.path}`);
}

async function main() {
  const courseIds = process.argv.slice(2);
  
  if (courseIds.length === 0) {
    console.log('Usage: npx tsx scripts/upload-courses.ts <courseId1> <courseId2> ...');
    console.log('\nExample:');
    console.log('  npx tsx scripts/upload-courses.ts verbs modals');
    process.exit(1);
  }

  try {
    const token = await login();
    
    for (const courseId of courseIds) {
      await uploadCourse(courseId, token);
    }
    
    console.log('\n✅ All courses uploaded successfully!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify in Courses page that new versions appear');
    console.log('  2. Run Course Contract Validation tests');
    console.log('  3. Check catalog cache has been updated');
  } catch (err) {
    console.error('\n❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
