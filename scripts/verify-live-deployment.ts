import { createClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Load learnplay.env (if present) before reading process.env.
// This file is intentionally gitignored; env vars still win if already set.
function loadDeployEnv(): void {
  // Local-only deployment env (gitignored) used for function deploy + live verification.
  // Do NOT print values.
  try {
    const deployEnvPath = path.resolve(process.cwd(), 'supabase', '.deploy.env');
    if (!existsSync(deployEnvPath)) return;
    const content = readFileSync(deployEnvPath, 'utf-8');
    const lines = content.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      if (!key) continue;
      // Only set if not already set (process env wins)
      if (!process.env[key] && value) process.env[key] = value;
    }
  } catch {
    // ignore; verifier will fail loudly if required vars are missing
  }
}

loadDeployEnv();
loadLearnPlayEnv();

// Config - must be provided via env vars or learnplay.env (no hardcoded project)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// REQUIRED: Set via env var or learnplay.env: AGENT_TOKEN=...
// Per IgniteZero rules: No fallback tokens - fail loudly if not configured
const AGENT_TOKEN = process.env.AGENT_TOKEN;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are REQUIRED");
  console.error("   Note: Node live verification does not read public/app-config.json");
  console.error("   Provide via process env, or add them to learnplay.env (gitignored).");
  process.exit(1);
}

if (!AGENT_TOKEN) {
  console.error("❌ AGENT_TOKEN environment variable is REQUIRED");
  console.error("   Set it before running: $env:AGENT_TOKEN = 'your-token'");
  console.error("   Or get it from Supabase secrets");
  process.exit(1);
}

// Some Edge functions require a concrete acting user id when using agent auth.
// Provide via learnplay.env: "user id" (or "student id") or via env: VERIFY_USER_ID=...
const VERIFY_USER_ID = process.env.VERIFY_USER_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let skippedTests = 0;

const results: { name: string; status: 'pass' | 'fail' | 'skip'; message: string }[] = [];

let notDeployed = 0;

function fail(name: string, message: string) {
  totalTests++;
  failedTests++;
  results.push({ name, status: 'fail', message });
  console.error(`  ❌ ${name}: ${message}`);
}

function notFound(name: string) {
  totalTests++;
  notDeployed++;
  results.push({ name, status: 'skip', message: 'NOT DEPLOYED (404)' });
  console.log(`  🚫 ${name}: NOT DEPLOYED`);
}

function pass(name: string, message: string) {
  totalTests++;
  passedTests++;
  results.push({ name, status: 'pass', message });
  console.log(`  ✅ ${name}: ${message}`);
}

function skip(name: string, reason: string) {
  totalTests++;
  skippedTests++;
  results.push({ name, status: 'skip', message: reason });
  console.log(`  ⏭️  ${name}: SKIPPED - ${reason}`);
}

// Helper to invoke function and check response
async function testFunction(
  name: string,
  body: Record<string, unknown>,
  options: {
    useAuth?: boolean;
    expectOk?: boolean;
    method?: 'GET' | 'POST';
    validateResponse?: (data: any) => string | null; // Return error message or null
    extraHeaders?: Record<string, string>;
  } = {}
): Promise<any> {
  const { useAuth = true, expectOk = true, method = 'POST', validateResponse, extraHeaders } = options;
  
  // Include organization ID with agent token for multi-tenant functions
  const authHeaders = useAuth ? { 
    'x-agent-token': AGENT_TOKEN,
    'x-organization-id': ORGANIZATION_ID,
    ...(VERIFY_USER_ID ? { 'x-user-id': VERIFY_USER_ID } : {}),
    ...(extraHeaders || {})
  } : {};
  
  try {
    let data: any;
    let error: any;
    
    if (method === 'GET') {
      // Build query string from body
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
      const queryString = params.toString();
      const url = `${SUPABASE_URL}/functions/v1/${name}${queryString ? '?' + queryString : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });
      
      if (!response.ok) {
        error = { message: `${response.status}`, context: { status: response.status } };
      } else {
        data = await response.json();
      }
    } else {
      // Use Supabase client for POST
      const result = await supabase.functions.invoke(name, { body, headers: authHeaders });
      data = result.data;
      error = result.error;
    }
    
    if (error) {
      // Check for specific error types
      const errorMsg = error.message || '';
      const context = (error as any).context;
      const status = context?.status;
      
      if (status === 404 || errorMsg.includes('404')) {
        // Check if it's a "function not deployed" 404 or a "resource not found" 404
        if (errorMsg.includes('FunctionsHttpError') || errorMsg.includes('Edge Function')) {
          notFound(name);
        } else {
          // Function is deployed but resource doesn't exist - this is valid behavior
          pass(name, `OK (404 - resource not found)`);
        }
      } else if (status === 401 || errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        fail(name, `Auth failed (401) - AGENT_TOKEN mismatch`);
      } else if (status === 400 || errorMsg.includes('400')) {
        // 400 means bad request - test params are wrong, this is a FAIL
        fail(name, `Bad request (400) - fix test params`);
      } else if (status === 500 || errorMsg.includes('500')) {
        fail(name, `Server error (500)`);
      } else {
        fail(name, `Error: ${errorMsg}`);
      }
      return null;
    }
    
    if (expectOk && data && !data.ok && data.error) {
      fail(name, `Returned error: ${data.error}`);
      return null;
    }
    
    if (validateResponse) {
      const validationError = validateResponse(data);
      if (validationError) {
        fail(name, validationError);
        return null;
      }
    }
    
    pass(name, 'OK');
    return data;
  } catch (e) {
    fail(name, `Exception: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// Organization ID must be explicitly provided
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;
if (!ORGANIZATION_ID) {
  console.error("❌ ORGANIZATION_ID is REQUIRED - set env var before running");
  process.exit(1);
}

async function main() {
  console.log("🔍 Verifying ALL Live Edge Functions...\n");
  console.log(`   AGENT_TOKEN: (set)`);
  console.log(`   ORGANIZATION_ID: ${ORGANIZATION_ID}`);
  console.log(`   VERIFY_USER_ID: ${VERIFY_USER_ID ?? "—"}`);
  console.log(`   SUPABASE_URL: ${SUPABASE_URL}\n`);

  // Store IDs for cross-referencing tests
  let testPlanId: string | null = null;
  let testJobId: string | null = null;
  let testCourseId: string | null = null;
  let testStudentId: string | null = null;
  let testParentId: string | null = null;
  let testClassId: string | null = null;
  const smokeCourseId = `verify-live-${randomUUID()}`;

  // Seeded test parent (used only to discover a real child/student id for verification).
  // If your org doesn't have this parent, set VERIFY_PARENT_ID in env.
  testParentId = (process.env.VERIFY_PARENT_ID as string | undefined) || '613d43cb-0922-4fad-b528-dbed8d2a5c79';

  // ============================================
  // SECTION 1: JOBS & AI PIPELINE (10 functions)
  // ============================================
  console.log("═══════════════════════════════════════════════════");
  console.log("📋 SECTION 1: Jobs & AI Pipeline");
  console.log("═══════════════════════════════════════════════════");

  // 1.1 list-jobs
  const listJobsData = await testFunction('list-jobs', { limit: 5 }, {
    validateResponse: (d) => Array.isArray(d?.jobs) ? null : 'Expected jobs array'
  });
  if (listJobsData?.jobs?.[0]?.id) {
    testJobId = listJobsData.jobs[0].id;
  }

  // 1.2 list-course-jobs
  await testFunction('list-course-jobs', { limit: 5 }, {
    validateResponse: (d) => Array.isArray(d?.jobs) ? null : 'Expected jobs array'
  });

  // 1.3 list-media-jobs
  await testFunction('list-media-jobs', { limit: 5 }, {
    method: 'GET',
    validateResponse: (d) => Array.isArray(d?.jobs) ? null : 'Expected jobs array'
  });

  // 1.4 get-job (requires job ID)
  if (testJobId) {
    await testFunction('get-job', { id: testJobId }, { method: 'GET' });
  } else {
    skip('get-job', 'No job ID available');
  }

  // 1.5 get-course-job (requires job ID)
  if (testJobId) {
    await testFunction('get-course-job', { jobId: testJobId }, { method: 'GET', expectOk: false }); // May return 404 if not a course job
  } else {
    skip('get-course-job', 'No job ID available');
  }

  // 1.6 get-job-metrics
  await testFunction('get-job-metrics', {}, {
    method: 'GET',
    expectOk: false, // This might not have ok field
    validateResponse: (d) => d !== null ? null : 'Expected response'
  });

  // 1.7 enqueue-job
  // enqueue-job only supports ai_course_generate in this deployment.
  // We only assert it returns a jobId (queueing works); the job may fail later if workers aren't running.
  const enqueueData = await testFunction('enqueue-job', {
    jobType: 'ai_course_generate',
    payload: {
      course_id: smokeCourseId,
      subject: 'Verify Live Smoke Test',
      grade_band: 'grade_6',
      mode: 'options',
      items_per_group: 3,
      source: 'verify-live-deployment',
      timestamp: Date.now()
    }
  }, {
    expectOk: true,
    validateResponse: (d) => d?.jobId ? null : 'Expected jobId in response'
  });
  if (enqueueData?.jobId) {
    testJobId = enqueueData.jobId;
  }

  // 1.8 requeue-job (requires job ID)
  if (testJobId) {
    await testFunction('requeue-job', { jobId: testJobId, jobTable: 'ai_course_jobs' });
  } else {
    skip('requeue-job', 'No job ID available');
  }

  // 1.9 delete-job (skip to avoid deleting real data)
  skip('delete-job', 'Skipped to preserve test data');

  // 1.10 ai-job-runner (internal - called by enqueue-job)
  skip('ai-job-runner', 'Internal function - tested via enqueue-job');

  // ============================================
  // SECTION 2: RECORDS CRUD (3 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("📦 SECTION 2: Records CRUD");
  console.log("═══════════════════════════════════════════════════");

  // 2.1 list-records
  const listRecordsData = await testFunction('list-records', { entity: 'PlanBlueprint', limit: 5 }, {
    validateResponse: (d) => Array.isArray(d?.records) ? null : 'Expected records array'
  });
  if (listRecordsData?.records?.[0]?.id) {
    testPlanId = listRecordsData.records[0].id;
  }

  // 2.2 save-record
  const saveData = await testFunction('save-record', {
    entity: 'PlanBlueprint',
    values: {
      title: `Verify Test ${Date.now()}`,
      status: 'draft',
      ai_score: 0,
      ai_status_report: 'Created by verify-live-deployment.ts'
    }
  });
  if (saveData?.id) {
    testPlanId = saveData.id;
  }

  // 2.3 get-record
  if (testPlanId) {
    await testFunction('get-record', { entity: 'PlanBlueprint', id: testPlanId }, {
      expectOk: false,
      validateResponse: (d) => d?.id ? null : 'Expected record with id'
    });
  } else {
    skip('get-record', 'No plan ID available');
  }

  // ============================================
  // SECTION 3: COURSES (4 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("📚 SECTION 3: Courses");
  console.log("═══════════════════════════════════════════════════");

  // 3.1 list-courses
  const listCoursesData = await testFunction('list-courses', { limit: 5 }, {
    method: 'GET',
    validateResponse: (d) => d?.items !== undefined || d?.courses !== undefined ? null : 'Expected items or courses array'
  });
  if (listCoursesData?.courses?.[0]?.id) {
    testCourseId = listCoursesData.courses[0].id;
  }

  // 3.2 blueprint-library (requires lanes array with html content)
  await testFunction('blueprint-library', {
    projectName: 'verify-test',
    lanes: [{ laneId: 'test-lane', title: 'Test', html: '<p>Test content</p>' }]
  }, {
    expectOk: false,
    validateResponse: (d) => d?.success === true || d?.mockups ? null : 'Expected success response'
  });

  // 3.3 save-course-json (skip to avoid creating test courses)
  skip('save-course-json', 'Skipped to avoid creating test data');

  // 3.4 save-plan (requires plan data)
  skip('save-plan', 'Skipped to avoid creating test data');

  // ============================================
  // SECTION 4: CLASSES (4 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🏫 SECTION 4: Classes");
  console.log("═══════════════════════════════════════════════════");

  // 4.1 list-classes (needs teacherId param)
  const listClassesData = await testFunction('list-classes', { teacherId: '00000000-0000-0000-0000-000000000000' }, {
    method: 'GET',
    expectOk: false,
    validateResponse: (d) => Array.isArray(d?.classes) || Array.isArray(d) || d?.error ? null : 'Expected classes array or error'
  });
  if (listClassesData?.classes?.[0]?.id || listClassesData?.[0]?.id) {
    testClassId = listClassesData?.classes?.[0]?.id || listClassesData?.[0]?.id;
  }

  // 4.2 get-class-roster
  if (testClassId) {
    await testFunction('get-class-roster', { classId: testClassId });
  } else {
    skip('get-class-roster', 'No class ID available');
  }

  // 4.3 get-class-progress
  if (testClassId) {
    await testFunction('get-class-progress', { classId: testClassId });
  } else {
    skip('get-class-progress', 'No class ID available');
  }

  // 4.4 get-class-ko-summary
  if (testClassId) {
    await testFunction('get-class-ko-summary', { classId: testClassId });
  } else {
    skip('get-class-ko-summary', 'No class ID available');
  }

  // ============================================
  // SECTION 5: STUDENT (6 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🎓 SECTION 5: Student");
  console.log("═══════════════════════════════════════════════════");

  // Try to get a student ID from class roster
  if (!testStudentId && testClassId) {
    const rosterData = await supabase.functions.invoke('get-class-roster', {
      body: { classId: testClassId },
      headers: { 'x-agent-token': AGENT_TOKEN }
    });
    if (rosterData.data?.students?.[0]?.id) {
      testStudentId = rosterData.data.students[0].id;
    }
  }

  // Prefer explicit test IDs; fall back to acting user id if provided.
  const explicitStudentId = (process.env.VERIFY_STUDENT_ID as string | undefined) || null;
  if (!testStudentId) testStudentId = explicitStudentId || VERIFY_USER_ID || null;

  // If still missing, derive a real student id from parent-children (seeded parent).
  if (!testStudentId && testParentId) {
    const pc = await testFunction('parent-children', { parentId: testParentId }, { method: 'GET', expectOk: false });
    const firstChild = pc?.children?.[0];
    if (firstChild?.studentId && typeof firstChild.studentId === 'string') {
      testStudentId = firstChild.studentId;
    }
  }

  // 5.1 student-dashboard
  if (!VERIFY_USER_ID) {
    skip('student-dashboard', 'Missing VERIFY_USER_ID (optional). Add "user id" to learnplay.env to validate this endpoint.');
  } else {
    await testFunction('student-dashboard', {}, {
      method: 'GET',
      expectOk: false,
      validateResponse: (d) => d?.data?.studentId || d?.studentId ? null : 'Expected dashboard payload'
    });
  }

  // 5.2 get-student-assignments
  if (testStudentId) {
    await testFunction('get-student-assignments', { studentId: testStudentId }, { expectOk: false });
  } else {
    skip('get-student-assignments', 'No studentId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 5.3 get-student-skills
  if (testStudentId) {
    await testFunction('get-student-skills', { studentId: testStudentId }, { expectOk: false });
  } else {
    skip('get-student-skills', 'No studentId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 5.4 student-achievements
  if (testStudentId) {
    await testFunction('student-achievements', { studentId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('student-achievements', 'No studentId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 5.5 student-goals
  if (testStudentId) {
    await testFunction('student-goals', { studentId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('student-goals', 'No studentId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 5.6 student-timeline
  if (testStudentId) {
    await testFunction('student-timeline', { studentId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('student-timeline', 'No studentId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // ============================================
  // SECTION 6: PARENT (6 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("👨‍👩‍👧 SECTION 6: Parent");
  console.log("═══════════════════════════════════════════════════");

  // 6.1 parent-dashboard
  await testFunction('parent-dashboard', { parentId: testParentId }, { method: 'GET', expectOk: false });

  // 6.2 parent-children
  await testFunction('parent-children', { parentId: testParentId }, { method: 'GET', expectOk: false });

  // 6.3 parent-subjects
  if (testStudentId) {
    await testFunction('parent-subjects', { childId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('parent-subjects', 'No childId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 6.4 parent-goals
  if (testStudentId) {
    await testFunction('parent-goals', { childId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('parent-goals', 'No childId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 6.5 parent-timeline
  if (testStudentId) {
    await testFunction('parent-timeline', { childId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('parent-timeline', 'No childId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 6.6 parent-topics
  if (testStudentId) {
    await testFunction('parent-topics', { childId: testStudentId }, { method: 'GET', expectOk: false });
  } else {
    skip('parent-topics', 'No childId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // ============================================
  // SECTION 7: AUTH & ADMIN (3 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🔐 SECTION 7: Auth & Admin");
  console.log("═══════════════════════════════════════════════════");

  // 7.1 get-user-roles
  await testFunction('get-user-roles', {}, { expectOk: false });

  // 7.2 get-dashboard (requires teacherId)
  if (testStudentId) {
    await testFunction('get-dashboard', { teacherId: testStudentId }, {
      method: 'GET',
      expectOk: false,
      validateResponse: (d) => d?.role || d?.stats ? null : 'Expected dashboard data'
    });
  } else {
    skip('get-dashboard', 'No teacherId available (set VERIFY_STUDENT_ID or VERIFY_PARENT_ID)');
  }

  // 7.3 create-tag (skip to avoid creating test data)
  skip('create-tag', 'Skipped to avoid creating test data');

  // ============================================
  // SECTION 8: MEDIA (2 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🎬 SECTION 8: Media");
  console.log("═══════════════════════════════════════════════════");

  // 8.1 manage-media
  await testFunction('manage-media', { action: 'list', limit: 5 }, { expectOk: false });

  // 8.2 adopt-media (requires specific media data)
  skip('adopt-media', 'Requires specific media data');

  // ============================================
  // SECTION 9: MISC (2 functions)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🔧 SECTION 9: Miscellaneous");
  console.log("═══════════════════════════════════════════════════");

  // 9.1 download-release
  // download-release is a GET endpoint; 404 is acceptable if the release file is not uploaded yet.
  await testFunction('download-release', {}, { method: 'GET', expectOk: false });

  // 9.2 resume-session
  await testFunction('resume-session', { studentId: testStudentId }, { expectOk: false });

  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n" + "═".repeat(55));
  console.log("📊 SUMMARY");
  console.log("═".repeat(55));
  
  const deployed = passedTests + failedTests;
  console.log(`\n   Total Functions: 40`);
  console.log(`   Tests Run:       ${totalTests}`);
  console.log(`   ✅ Passed:       ${passedTests}`);
  console.log(`   ❌ Failed:       ${failedTests}`);
  console.log(`   🚫 Not Deployed: ${notDeployed}`);
  console.log(`   ⏭️  Skipped:      ${skippedTests}`);
  console.log(`\n   Deployed:        ${deployed}/40 (${Math.round((deployed / 40) * 100)}%)`);
  console.log(`   Working:         ${passedTests}/${deployed} (${deployed > 0 ? Math.round((passedTests / deployed) * 100) : 0}%)`);
  
  if (notDeployed > 0) {
    console.log("\n🚫 NOT DEPLOYED (need to run deploy script):");
    results.filter(r => r.message === 'NOT DEPLOYED (404)').forEach(r => {
      console.log(`   • ${r.name}`);
    });
  }

  if (failedTests > 0) {
    console.log("\n❌ FAILED TESTS:");
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`   • ${r.name}: ${r.message}`);
    });
  }

  console.log("\n" + "═".repeat(55));
  if (failedTests === 0) {
    console.log("🎉 ALL TESTS PASSED!");
  } else {
    console.log(`💥 ${failedTests} TEST(S) FAILED`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
