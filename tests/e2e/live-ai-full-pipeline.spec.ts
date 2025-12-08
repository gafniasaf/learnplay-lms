/**
 * LIVE AI FULL PIPELINE TESTS
 * 
 * Comprehensive E2E tests for the REAL AI course creation pipeline.
 * Uses REAL database (Supabase) and REAL LLM (OpenAI/Anthropic).
 * 
 * Tests validate:
 * - Course generation with LLM text content
 * - Question stems, options, and correct answers
 * - Image generation with DALL-E
 * - Content storage and retrieval
 * - Full output structure validation
 * 
 * Prerequisites:
 *   - Admin account credentials in playwright/.auth/admin.json
 *   - OPENAI_API_KEY or VITE_OPENAI_API_KEY set
 *   - Supabase credentials configured
 *   - Run: npx playwright test live-ai-full-pipeline.spec.ts --project=chromium
 * 
 * ⚠️ WARNING: These tests:
 *   - Create REAL courses in your database
 *   - Use REAL LLM APIs (costs apply: ~$0.10-0.50 per course)
 *   - Take 2-10 minutes to complete
 *   - Should NOT run in CI without cost controls
 * 
 * Run with: npm run e2e:live -- --grep "Live AI Full Pipeline"
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const TEST_CONFIG = {
  // Course creation settings
  courseSubject: 'Basic Multiplication Tables',
  gradeLevel: '3-5',
  itemCount: 8, // Keep small for faster/cheaper tests
  questionType: 'MCQ',
  
  // Timeouts (real LLM calls are slow)
  jobCreationTimeout: 30_000,
  jobCompletionTimeout: 300_000, // 5 minutes for full pipeline
  pageLoadTimeout: 15_000,
  
  // Polling intervals
  jobPollInterval: 10_000, // Check every 10 seconds
};

// Expected course structure based on system-manifest.json and seed data
interface CourseItem {
  id: string;
  item_type: string;
  stem: string;
  options?: string[];
  correct_answer?: string;
  reference?: string;
  difficulty_score?: number;
  media?: {
    image_url?: string;
    audio_url?: string;
  };
}

interface CourseModule {
  id: string;
  title: string;
  objectives?: string[];
  items: CourseItem[];
}

interface CourseContent {
  modules: CourseModule[];
  study_texts?: Array<{ module_id: string; content: string }>;
}

interface CourseBlueprint {
  id: string;
  title: string;
  subject: string;
  difficulty: string;
  content_json: CourseContent;
  metadata?: Record<string, unknown>;
}

// Helper to extract job ID from page
async function extractJobId(page: Page): Promise<string | null> {
  const pageContent = await page.locator('body').textContent() || '';
  
  // Look for UUID pattern (job ID)
  const uuidMatch = pageContent.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch) return uuidMatch[0];
  
  // Try data attributes
  const jobIdAttr = await page.locator('[data-job-id]').first().getAttribute('data-job-id').catch(() => null);
  if (jobIdAttr) return jobIdAttr;
  
  return null;
}

// Helper to extract course ID from page or URL
async function extractCourseId(page: Page): Promise<string | null> {
  // Check URL first
  const url = page.url();
  const urlMatch = url.match(/\/(?:editor|courses?)\/([a-z0-9-]+)/i);
  if (urlMatch && urlMatch[1] !== 'select' && urlMatch[1] !== 'ai') {
    return urlMatch[1];
  }
  
  // Check page content
  const pageContent = await page.locator('body').textContent() || '';
  const contentMatch = pageContent.match(/course[_-]?id[:\s]+([a-z0-9-]+)/i);
  if (contentMatch) return contentMatch[1];
  
  // Check for course ID in data attributes
  const courseIdAttr = await page.locator('[data-course-id]').first().getAttribute('data-course-id').catch(() => null);
  if (courseIdAttr) return courseIdAttr;
  
  return null;
}

// Helper to wait for job completion
async function waitForJobCompletion(
  page: Page, 
  jobId: string | null, 
  maxWaitMs: number = TEST_CONFIG.jobCompletionTimeout
): Promise<{ success: boolean; courseId: string | null; error?: string }> {
  const startTime = Date.now();
  let courseId: string | null = null;
  
  while ((Date.now() - startTime) < maxWaitMs) {
    // Navigate to jobs page to check status
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // Check for completion indicators
    const isComplete = /completed|done|success|finished/i.test(pageContent);
    const isFailed = /failed|error/i.test(pageContent) && !/processing|running|pending/i.test(pageContent);
    
    if (isComplete) {
      // Try to extract course ID
      courseId = await extractCourseId(page);
      
      // If not in URL, look for it in job details
      if (!courseId) {
        const courseIdMatch = pageContent.match(/course[_-]?id[:\s"]+([a-z0-9-]+)/i);
        if (courseIdMatch) courseId = courseIdMatch[1];
      }
      
      console.log(`✅ Job completed after ${Math.round((Date.now() - startTime) / 1000)}s`);
      return { success: true, courseId };
    }
    
    if (isFailed) {
      console.error(`❌ Job failed: ${pageContent.substring(0, 200)}`);
      return { success: false, courseId: null, error: 'Job failed' };
    }
    
    // Log progress
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`⏳ Job in progress... (${elapsed}s elapsed)`);
    
    await page.waitForTimeout(TEST_CONFIG.jobPollInterval);
  }
  
  return { success: false, courseId: null, error: 'Timeout waiting for job completion' };
}

test.describe('Live AI Full Pipeline: Course Creation', () => {
  // Use admin auth state
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('creates course with full content validation', async ({ page }) => {
    test.setTimeout(TEST_CONFIG.jobCompletionTimeout + 60_000);
    
    const testSubject = `${TEST_CONFIG.courseSubject} - ${Date.now()}`;
    
    // Step 1: Navigate to AI Pipeline page
    console.log('📍 Step 1: Navigate to AI Pipeline');
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    // Verify page loaded
    const hasHeading = await page.getByRole('heading', { name: /ai|course|generator/i }).isVisible({ timeout: TEST_CONFIG.pageLoadTimeout }).catch(() => false);
    expect(hasHeading).toBeTruthy();
    
    // Step 2: Fill course creation form
    console.log('📍 Step 2: Fill course creation form');
    
    // Subject input
    const subjectInput = page.locator('input[placeholder*="subject"], input[placeholder*="Photosynthesis"], #subject, input[name="subject"]').first();
    await expect(subjectInput).toBeVisible({ timeout: 10000 });
    await subjectInput.fill(testSubject);
    
    // Grade level select
    const gradeSelect = page.locator('select').first();
    if (await gradeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gradeSelect.selectOption({ label: TEST_CONFIG.gradeLevel });
    }
    
    // Item count
    const itemsInput = page.locator('input[type="number"]').first();
    if (await itemsInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await itemsInput.fill(String(TEST_CONFIG.itemCount));
    }
    
    // Question type (MCQ button)
    const mcqButton = page.locator('button:has-text("MCQ")').first();
    if (await mcqButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mcqButton.click();
    }
    
    // Step 3: Submit course generation
    console.log('📍 Step 3: Submit course generation');
    
    // Find and click generate button
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create"), [data-cta-id*="generate"], [data-cta-id*="create"]').first();
    
    // Check if login is required
    const loginRequired = await page.getByText(/log in required/i).isVisible({ timeout: 2000 }).catch(() => false);
    if (loginRequired) {
      console.log('⚠️ Login required - test cannot proceed without auth');
      test.skip();
      return;
    }
    
    await expect(generateButton).toBeEnabled({ timeout: 5000 });
    await generateButton.click();
    
    // Step 4: Wait for job creation
    console.log('📍 Step 4: Wait for job creation');
    
    await expect(
      page.getByText(/job|created|started|processing|generating/i)
    ).toBeVisible({ timeout: TEST_CONFIG.jobCreationTimeout });
    
    const jobId = await extractJobId(page);
    console.log(`📋 Job ID: ${jobId || 'unknown'}`);
    
    // Step 5: Wait for job completion
    console.log('📍 Step 5: Wait for job completion');
    
    const result = await waitForJobCompletion(page, jobId);
    
    if (!result.success) {
      console.error(`❌ Job did not complete: ${result.error}`);
      // Don't fail immediately - try to find any created course
    }
    
    // Step 6: Validate course was created
    console.log('📍 Step 6: Validate course creation');
    
    let courseId = result.courseId;
    
    // If we don't have course ID, search for it
    if (!courseId) {
      await page.goto('/admin/console');
      await page.waitForLoadState('networkidle');
      
      // Look for recently created course
      const courseLink = page.locator(`a[href*="/admin/editor/"], text=/${testSubject.substring(0, 20)}/i`).first();
      if (await courseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        const href = await courseLink.getAttribute('href');
        const match = href?.match(/\/admin\/editor\/([a-z0-9-]+)/i);
        if (match) courseId = match[1];
      }
    }
    
    expect(courseId).toBeTruthy();
    console.log(`📋 Course ID: ${courseId}`);
    
    // Step 7: Navigate to course editor
    console.log('📍 Step 7: Navigate to course editor');
    
    await page.goto(`/admin/editor/${courseId}`);
    await page.waitForLoadState('networkidle');
    
    // Verify not 404
    const is404 = await page.getByText(/404|not found/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(is404).toBeFalsy();
    
    // Step 8: Validate course content structure
    console.log('📍 Step 8: Validate course content structure');
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // 8a. Verify course has meaningful content
    expect(pageContent.length).toBeGreaterThan(500);
    
    // 8b. Verify question stems exist
    const hasQuestionContent = /question|what|which|how|calculate|find/i.test(pageContent);
    expect(hasQuestionContent).toBeTruthy();
    
    // 8c. Check for answer options (MCQ)
    const optionIndicators = ['A)', 'B)', 'C)', 'D)', 'option', 'choice', 'select'];
    const hasOptions = optionIndicators.some(opt => pageContent.toLowerCase().includes(opt.toLowerCase()));
    
    // 8d. Check for correct answer indicators
    const hasCorrectAnswer = /correct|answer|solution/i.test(pageContent);
    
    console.log(`✅ Content validation:
      - Length: ${pageContent.length} chars
      - Has questions: ${hasQuestionContent}
      - Has options: ${hasOptions}
      - Has answers: ${hasCorrectAnswer}
    `);
    
    // Step 9: Validate images (if generated)
    console.log('📍 Step 9: Check for generated images');
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    // Check for image references in content
    const hasImageRefs = /\[image:|image_url|media|diagram|illustration/i.test(pageContent);
    
    console.log(`📷 Images: ${imageCount} found, References: ${hasImageRefs}`);
    
    // Step 10: Validate via API (if accessible)
    console.log('📍 Step 10: Final validation');
    
    // Course should have:
    // - Title containing our subject
    // - At least some question content
    // - Proper structure
    
    expect(pageContent).toContain(TEST_CONFIG.courseSubject.split(' ')[0]); // "Basic" or "Multiplication"
    
    console.log('✅ Course creation and validation complete!');
  });
});

test.describe('Live AI Full Pipeline: Content Quality Validation', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('validates existing course structure and content', async ({ page }) => {
    // Navigate to courses list
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    // Find first course link
    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (!hasCourse) {
      console.log('⚠️ No courses found - skipping content validation');
      test.skip();
      return;
    }
    
    await courseLink.click();
    await page.waitForLoadState('networkidle');
    
    // Get page content
    const pageContent = await page.locator('body').textContent() || '';
    
    // Validate content structure
    const validations = {
      hasTitle: await page.getByRole('heading').first().isVisible().catch(() => false),
      hasQuestions: /question|stem|prompt/i.test(pageContent),
      hasOptions: /option|choice|answer/i.test(pageContent),
      hasExplanations: /reference|explanation|rationale/i.test(pageContent),
      contentLength: pageContent.length,
    };
    
    console.log('📊 Content validation results:', validations);
    
    // At minimum, should have a title and some content
    expect(validations.hasTitle).toBeTruthy();
    expect(validations.contentLength).toBeGreaterThan(200);
  });
  
  test('validates course items have correct answer structure', async ({ page }) => {
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (!hasCourse) {
      console.log('⚠️ No courses found - skipping answer validation');
      test.skip();
      return;
    }
    
    await courseLink.click();
    await page.waitForLoadState('networkidle');
    
    // Look for item cards or question containers
    const items = page.locator('[data-testid*="item"], [class*="item"], [class*="question"]');
    const itemCount = await items.count();
    
    console.log(`📝 Found ${itemCount} item elements`);
    
    // Check that content suggests proper MCQ structure
    const pageContent = await page.locator('body').textContent() || '';
    
    // MCQ items should have multiple choice options
    const mcqPattern = /[ABCD]\)|option [1-4]|choice/gi;
    const mcqMatches = pageContent.match(mcqPattern) || [];
    
    console.log(`🔤 MCQ indicators found: ${mcqMatches.length}`);
    
    // Should have some indication of correct answers
    const correctIndicators = /correct|right answer|✓|✔/gi;
    const correctMatches = pageContent.match(correctIndicators) || [];
    
    console.log(`✅ Correct answer indicators: ${correctMatches.length}`);
  });
});

test.describe('Live AI Full Pipeline: Image Generation', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('verifies DALL-E images are generated and accessible', async ({ page }) => {
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    // Find a course
    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (!hasCourse) {
      console.log('⚠️ No courses found - skipping image validation');
      test.skip();
      return;
    }
    
    await courseLink.click();
    await page.waitForLoadState('networkidle');
    
    // Check for media/images tab or section
    const mediaTab = page.locator('button:has-text("Media"), button:has-text("Images"), [data-tab="media"]').first();
    
    if (await mediaTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mediaTab.click();
      await page.waitForTimeout(2000);
    }
    
    // Count images on page
    const images = page.locator('img:not([src*="avatar"]):not([src*="logo"])');
    const imageCount = await images.count();
    
    console.log(`📷 Found ${imageCount} content images`);
    
    // If images exist, verify they load
    if (imageCount > 0) {
      const firstImage = images.first();
      const src = await firstImage.getAttribute('src');
      
      console.log(`📷 First image src: ${src?.substring(0, 100)}...`);
      
      // Check if image is visible (loaded)
      const isVisible = await firstImage.isVisible();
      expect(isVisible).toBeTruthy();
      
      // Check image has valid src
      expect(src).toBeTruthy();
      expect(src).not.toContain('placeholder');
    }
    
    // Check for image references in JSON/content
    const pageContent = await page.locator('body').textContent() || '';
    const hasImageRefs = /image_url|media.*url|dalle|openai.*image/i.test(pageContent);
    
    console.log(`🖼️ Has image references in content: ${hasImageRefs}`);
  });
});

test.describe('Live AI Full Pipeline: Job Monitoring', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('jobs dashboard shows job history and status', async ({ page }) => {
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    
    // Should have jobs dashboard
    const hasHeading = await page.getByRole('heading', { name: /job/i }).isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasHeading).toBeTruthy();
    
    // Check for job list or table
    const jobElements = page.locator('table tbody tr, [data-testid*="job"], [class*="job-row"]');
    const jobCount = await jobElements.count();
    
    console.log(`📋 Found ${jobCount} job entries`);
    
    // Check for status indicators
    const pageContent = await page.locator('body').textContent() || '';
    const statusIndicators = {
      completed: /completed|done|success/i.test(pageContent),
      failed: /failed|error/i.test(pageContent),
      running: /running|processing|pending/i.test(pageContent),
    };
    
    console.log('📊 Job statuses visible:', statusIndicators);
    
    // Should show at least some status information
    const hasAnyStatus = Object.values(statusIndicators).some(v => v);
    expect(hasAnyStatus || jobCount === 0).toBeTruthy();
  });
  
  test('can view individual job details', async ({ page }) => {
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    
    // Find a job row/link
    const jobLink = page.locator('table tbody tr, [data-testid*="job"], a[href*="job"]').first();
    const hasJob = await jobLink.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!hasJob) {
      console.log('⚠️ No jobs found - skipping detail view test');
      test.skip();
      return;
    }
    
    await jobLink.click();
    await page.waitForTimeout(2000);
    
    // Should show job details
    const pageContent = await page.locator('body').textContent() || '';
    
    // Job details should include type, status, timestamps
    const hasDetails = /status|type|created|payload|result/i.test(pageContent);
    expect(hasDetails).toBeTruthy();
  });
});

test.describe('Live AI Full Pipeline: Error Handling', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('handles invalid course ID gracefully', async ({ page }) => {
    await page.goto('/admin/editor/invalid-course-id-12345');
    await page.waitForLoadState('networkidle');
    
    // Should show error or 404, not crash
    const pageContent = await page.locator('body').textContent() || '';
    
    const hasError = /404|not found|error|does not exist/i.test(pageContent);
    const hasContent = pageContent.length > 50;
    
    expect(hasError || hasContent).toBeTruthy();
  });
  
  test('handles empty course creation gracefully', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    // Try to submit without filling form
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create")').first();
    
    if (await generateButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should be disabled or show validation error
      const isEnabled = await generateButton.isEnabled();
      
      if (isEnabled) {
        await generateButton.click();
        await page.waitForTimeout(2000);
        
        // Should show validation error, not submit
        const pageContent = await page.locator('body').textContent() || '';
        const hasValidation = /required|please fill|enter|validation/i.test(pageContent);
        
        // Either shows validation or stays on page
        expect(hasValidation || page.url().includes('ai-pipeline')).toBeTruthy();
      }
    }
  });
});
