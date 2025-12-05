#!/usr/bin/env tsx
/**
 * Backfill course_metadata from existing JSON courses in Supabase Storage
 * 
 * This script:
 * 1. Lists all course JSON files in storage
 * 2. Loads each course and extracts metadata
 * 3. Creates course_metadata rows (if not exists)
 * 4. Extracts suggested tags and creates tag approval queue entries
 * 5. Generates validation report
 * 
 * Usage:
 *   npm run backfill:metadata
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('  VITE_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';  // LearnPlay default org

interface Course {
  id: string;
  title?: string;
  description?: string;
  contentVersion?: number;
  locale?: string;
  items?: any[];
  groups?: any[];
  levels?: any[];
  studyTexts?: any[];
}

interface BackfillResult {
  courseId: string;
  status: 'created' | 'exists' | 'error';
  suggestedTags?: Record<string, string[]>;
  error?: string;
}

interface BackfillReport {
  startedAt: string;
  completedAt?: string;
  totalCourses: number;
  created: number;
  exists: number;
  errors: number;
  results: BackfillResult[];
}

async function listCoursesFromStorage(): Promise<string[]> {
  console.log('📂 Listing courses from storage...');
  
  const { data: files, error } = await supabase
    .storage
    .from('courses')
    .list('', {
      limit: 10000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) {
    throw new Error(`Failed to list storage files: ${error.message}`);
  }

  const courseFiles = files
    .filter(file => file.name.endsWith('.json'))
    .map(file => file.name.replace('.json', ''));

  console.log(`   Found ${courseFiles.length} course JSON files`);
  return courseFiles;
}

async function loadCourseFromStorage(courseId: string): Promise<Course | null> {
  const { data, error } = await supabase
    .storage
    .from('courses')
    .download(`${courseId}.json`);

  if (error) {
    console.warn(`   ⚠️  Failed to download ${courseId}.json: ${error.message}`);
    return null;
  }

  try {
    const text = await data.text();
    const course = JSON.parse(text);
    return course;
  } catch (err) {
    console.warn(`   ⚠️  Failed to parse ${courseId}.json: ${err}`);
    return null;
  }
}

function extractSuggestedTags(course: Course): Record<string, string[]> {
  const tags: Record<string, string[]> = {};

  // Heuristic extraction from course structure
  // (In production, this would be more sophisticated)
  
  // Extract from title/description keywords
  const text = `${course.title || ''} ${course.description || ''}`.toLowerCase();
  
  // Domain heuristics
  if (text.match(/math|number|count|add|subtract|multiply|divide/)) {
    tags.domain = tags.domain || [];
    tags.domain.push('Mathematics');
  }
  if (text.match(/science|experiment|biology|chemistry|physics/)) {
    tags.domain = tags.domain || [];
    tags.domain.push('Science');
  }
  if (text.match(/time|clock|hour|minute/)) {
    tags.theme = tags.theme || [];
    tags.theme.push('Time');
  }
  if (text.match(/heart|anatomy|body|organ/)) {
    tags.theme = tags.theme || [];
    tags.theme.push('Anatomy');
  }
  
  // Level heuristics
  if (text.match(/grade\s*(\d+)/)) {
    const grade = parseInt(text.match(/grade\s*(\d+)/)![1]);
    if (grade <= 2) {
      tags.level = ['Kindergarten'];
    } else if (grade <= 5) {
      tags.level = ['Elementary'];
    } else if (grade <= 8) {
      tags.level = ['Middle School'];
    } else {
      tags.level = ['High School'];
    }
  }
  
  return tags;
}

async function backfillCourseMetadata(courseId: string, course: Course): Promise<BackfillResult> {
  try {
    // Check if metadata already exists
    const { data: existing } = await supabase
      .from('course_metadata')
      .select('id')
      .eq('id', courseId)
      .single();

    if (existing) {
      return { courseId, status: 'exists' };
    }

    // Extract suggested tags
    const suggestedTags = extractSuggestedTags(course);

    // Create course_metadata
    const { error: insertError } = await supabase
      .from('course_metadata')
      .insert({
        id: courseId,
        organization_id: DEFAULT_ORG_ID,
        visibility: 'global',  // Default to global
        tag_ids: [],           // Empty until admin approves tags
        content_version: course.contentVersion || 1,
        etag: 1
      });

    if (insertError) {
      throw new Error(`Failed to insert metadata: ${insertError.message}`);
    }

    // Create tag approval queue entry if tags suggested
    if (Object.keys(suggestedTags).length > 0) {
      await supabase
        .from('tag_approval_queue')
        .insert({
          organization_id: DEFAULT_ORG_ID,
          course_id: courseId,
          suggested_tags: suggestedTags,
          status: 'pending'
        });
    }

    return { courseId, status: 'created', suggestedTags };
  } catch (err: any) {
    return { courseId, status: 'error', error: err.message };
  }
}

async function generateReport(report: BackfillReport): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(process.cwd(), 'reports', `backfill-metadata-${timestamp}.md`);
  
  const md: string[] = [
    `# Course Metadata Backfill Report`,
    '',
    `**Started:** ${report.startedAt}`,
    `**Completed:** ${report.completedAt}`,
    `**Duration:** ${calculateDuration(report.startedAt, report.completedAt!)}`,
    '',
    `## Summary`,
    '',
    `- **Total Courses:** ${report.totalCourses}`,
    `- **Created:** ${report.created}`,
    `- **Already Exist:** ${report.exists}`,
    `- **Errors:** ${report.errors}`,
    '',
    `## Results`,
    ''
  ];

  // Group by status
  const created = report.results.filter(r => r.status === 'created');
  const existing = report.results.filter(r => r.status === 'exists');
  const errors = report.results.filter(r => r.status === 'error');

  if (created.length > 0) {
    md.push(`### ✅ Created (${created.length})`);
    md.push('');
    created.forEach(r => {
      md.push(`- **${r.courseId}**`);
      if (r.suggestedTags && Object.keys(r.suggestedTags).length > 0) {
        Object.entries(r.suggestedTags).forEach(([type, values]) => {
          md.push(`  - ${type}: ${values.join(', ')}`);
        });
      }
    });
    md.push('');
  }

  if (existing.length > 0) {
    md.push(`### ℹ️  Already Exist (${existing.length})`);
    md.push('');
    md.push(existing.map(r => `- ${r.courseId}`).join('\n'));
    md.push('');
  }

  if (errors.length > 0) {
    md.push(`### ❌ Errors (${errors.length})`);
    md.push('');
    errors.forEach(r => {
      md.push(`- **${r.courseId}**: ${r.error}`);
    });
    md.push('');
  }

  md.push(`## Next Steps`);
  md.push('');
  md.push(`1. Review suggested tags in tag approval queue`);
  md.push(`2. Map AI-suggested tags to curated tags in admin UI`);
  md.push(`3. Approve tags and publish courses`);
  md.push(`4. Verify courses appear in CourseSelector with correct filters`);
  md.push('');

  const content = md.join('\n');
  await fs.writeFile(reportPath, content, 'utf-8');
  
  console.log(`\n📄 Report written to: ${reportPath}`);
}

function calculateDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

async function main() {
  console.log('🚀 Starting course_metadata backfill...\n');
  
  const report: BackfillReport = {
    startedAt: new Date().toISOString(),
    totalCourses: 0,
    created: 0,
    exists: 0,
    errors: 0,
    results: []
  };

  try {
    // List all courses
    const courseIds = await listCoursesFromStorage();
    report.totalCourses = courseIds.length;

    console.log(`\n📝 Processing ${courseIds.length} courses...\n`);

    // Process each course
    let processed = 0;
    for (const courseId of courseIds) {
      processed++;
      process.stdout.write(`\r   [${processed}/${courseIds.length}] ${courseId}...`);

      const course = await loadCourseFromStorage(courseId);
      if (!course) {
        report.results.push({ courseId, status: 'error', error: 'Failed to load course JSON' });
        report.errors++;
        continue;
      }

      const result = await backfillCourseMetadata(courseId, course);
      report.results.push(result);

      if (result.status === 'created') {
        report.created++;
      } else if (result.status === 'exists') {
        report.exists++;
      } else {
        report.errors++;
      }
    }

    console.log('\n');
    report.completedAt = new Date().toISOString();

    // Print summary
    console.log('\n✨ Backfill complete!\n');
    console.log(`   Total:   ${report.totalCourses}`);
    console.log(`   Created: ${report.created}`);
    console.log(`   Exists:  ${report.exists}`);
    console.log(`   Errors:  ${report.errors}`);

    // Generate report
    await generateReport(report);

    // Write artifacts
    const artifactsPath = path.join(process.cwd(), 'artifacts', `backfill-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(artifactsPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📦 Artifacts written to: ${artifactsPath}\n`);

    process.exit(report.errors > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('\n❌ Backfill failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();

