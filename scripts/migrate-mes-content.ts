#!/usr/bin/env tsx
/**
 * MES Content Migration Script
 * 
 * Downloads ALL content from Kevin's MES Supabase database (yqpqdtedhoffgmurpped)
 * and imports into your LearnPlay Supabase project.
 * 
 * Data Sources:
 * - Source: Kevin's MES Supabase (public read via anon key)
 * - Uses: get_course_content(course_id) RPC function
 * - Multimedia: Azure Blob Storage (https://expertcollegeresources.blob.core.windows.net/assets-cnt/)
 * 
 * Target:
 * - Storage: courses/{id}/course.json
 * - DB: course_metadata table
 * - Multimedia: media-library bucket (optional)
 * 
 * Usage:
 *   npx tsx scripts/migrate-mes-content.ts --list
 *   npx tsx scripts/migrate-mes-content.ts --courseId=169
 *   npx tsx scripts/migrate-mes-content.ts --batch=10
 *   npx tsx scripts/migrate-mes-content.ts --all
 *   npx tsx scripts/migrate-mes-content.ts --all --migrate-images
 * 
 * Required env vars (from mes-migration.env or environment):
 *   SUPABASE_URL               - Your target LearnPlay Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Your target service role key
 *   ORGANIZATION_ID            - Your organization ID (for multi-tenant scoping)
 * 
 * Optional env vars:
 *   MES_SUPABASE_URL           - Kevin's MES Supabase URL (defaults to known value)
 *   MES_ANON_KEY               - Kevin's MES anon key (defaults to known value)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';
import { transformLegacyCourse, extractImageUrls } from './legacy-import/transform';
import { ImageMigrator, normalizeLegacyImageUrl } from './legacy-import/image-migrator';
import type { LegacyCourseContent, ImportResult } from './legacy-import/types';

// ═══════════════════════════════════════════════════════════════════════════
// KEVIN'S MES DATABASE (Source)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_MES_SUPABASE_URL = 'https://yqpqdtedhoffgmurpped.supabase.co';
const DEFAULT_MES_ANON_KEY = 'sb_publishable_s6WSybdYV_UqHRGLltgQgg_XZGHY-gD';

// Alternative: Direct PostgreSQL connection (if Supabase client doesn't work)
// const MES_POSTGRES_URL = 'postgresql://postgres.yqpqdtedhoffgmurpped:d584WwaNjJbcQxHs@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';

// ═══════════════════════════════════════════════════════════════════════════
// AZURE BLOB STORAGE (Multimedia)
// ═══════════════════════════════════════════════════════════════════════════

const AZURE_BLOB_BASE = 'https://expertcollegeresources.blob.core.windows.net/assets-cnt';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MesCourse {
  mes_course_id: number;
  mes_course_name: string;
  mes_course_language: string | null;
  mes_course_type: string | null;
  mes_course_properties: string | null;
}

interface MigrationStats {
  totalCourses: number;
  successCount: number;
  failedCount: number;
  itemsImported: number;
  studyTextsImported: number;
  imagesMigrated: number;
  imagesFailedCount: number;
  errors: Array<{ courseId: number; error: string }>;
}

interface Checkpoint {
  version: 1;
  started_at: string;
  updated_at: string;
  last_course_id: number;
  stats: MigrationStats;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function nowIso(): string {
  return new Date().toISOString();
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`❌ BLOCKED: ${name} is REQUIRED - set env var or populate mes-migration.env`);
    process.exit(1);
  }
  return v.trim();
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function getArg(flag: string): string | null {
  const arg = process.argv.find(a => a.startsWith(`${flag}=`));
  return arg ? arg.split('=')[1] : null;
}

function getIntArg(flag: string, defaultVal: number): number {
  const val = getArg(flag);
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  return isNaN(n) ? defaultVal : n;
}

function loadEnvFile(filePath: string): void {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return;
  
  const content = fs.readFileSync(abs, 'utf8');
  for (const raw of content.split(/\r?\n/g)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.length >= 2 && 
        ((value.startsWith('"') && value.endsWith('"')) || 
         (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readCheckpoint(cpPath: string): Checkpoint | null {
  if (!fs.existsSync(cpPath)) return null;
  try {
    const raw = fs.readFileSync(cpPath, 'utf8');
    const parsed = JSON.parse(raw) as Checkpoint;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCheckpoint(cpPath: string, cp: Checkpoint): void {
  const dir = path.dirname(cpPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2) + '\n', 'utf8');
}

// ═══════════════════════════════════════════════════════════════════════════
// MES DATABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function createMesClient(): SupabaseClient {
  const url = process.env.MES_SUPABASE_URL || DEFAULT_MES_SUPABASE_URL;
  const key = process.env.MES_ANON_KEY || DEFAULT_MES_ANON_KEY;
  
  console.log(`📡 Connecting to MES Supabase: ${url}`);
  
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listMesCourses(client: SupabaseClient, limit = 1000): Promise<MesCourse[]> {
  const { data, error } = await client
    .from('mes_course')
    .select('mes_course_id, mes_course_name, mes_course_language, mes_course_type, mes_course_properties')
    .order('mes_course_id', { ascending: true })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to list courses: ${error.message}`);
  }
  
  return (data || []) as MesCourse[];
}

async function getMesCourseContent(client: SupabaseClient, courseId: number): Promise<LegacyCourseContent | null> {
  const { data, error } = await client.rpc('get_course_content', { p_course_id: courseId });
  
  if (error) {
    console.error(`  ⚠️ RPC error for course ${courseId}: ${error.message}`);
    return null;
  }
  
  return data as LegacyCourseContent;
}

// ═══════════════════════════════════════════════════════════════════════════
// TARGET DATABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function createTargetClient(): SupabaseClient {
  const url = mustEnv('SUPABASE_URL');
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  
  console.log(`📡 Connecting to Target Supabase: ${url}`);
  
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function migrateSingleCourse(
  mesClient: SupabaseClient,
  targetClient: SupabaseClient,
  courseId: number,
  options: {
    migrateImages: boolean;
    locale: string;
    dryRun: boolean;
    organizationId: string;
  }
): Promise<ImportResult> {
  const result: ImportResult = {
    courseId: `mes-${courseId}`,
    success: false,
    itemsImported: 0,
    studyTextsImported: 0,
    imagesMigrated: 0,
    imagesFailedCount: 0,
    errors: [],
    warnings: [],
  };

  try {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📚 Migrating course ID: ${courseId}`);
    console.log(`${'─'.repeat(60)}`);

    // 1. Fetch course content using RPC
    console.log('\n📥 Fetching course content via get_course_content()...');
    const legacyContent = await getMesCourseContent(mesClient, courseId);
    
    if (!legacyContent) {
      result.errors.push('Failed to fetch course content');
      return result;
    }
    
    if (!legacyContent.course || legacyContent.course.length === 0) {
      result.errors.push('Course not found in MES database');
      return result;
    }

    const courseMeta = legacyContent.course[0];
    console.log(`   Course: ${courseMeta.name}`);
    console.log(`   Topics: ${legacyContent.topics?.length || 0}`);
    console.log(`   Subjects: ${legacyContent.subjects?.length || 0}`);

    // Count exercises (non-null exercise_id entries)
    const exerciseCount = legacyContent.topics?.filter(t => t.mes_exercise_id !== null).length || 0;
    const studyTextCount = legacyContent.subjects?.filter(s => s.mes_studytext_id !== null).length || 0;
    console.log(`   Exercises: ${exerciseCount}`);
    console.log(`   Study Texts: ${studyTextCount}`);

    // 2. Extract and migrate images (optional)
    let imageUrlMapper: ((url: string) => string) | undefined;
    
    if (options.migrateImages) {
      console.log('\n🖼️  Extracting multimedia URLs...');
      const imageUrls = extractImageUrls(legacyContent).map(normalizeLegacyImageUrl);
      console.log(`   Found ${imageUrls.length} multimedia items`);

      if (imageUrls.length > 0 && !options.dryRun) {
        const targetUrl = mustEnv('SUPABASE_URL');
        const targetKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
        const migrator = new ImageMigrator(targetUrl, targetKey);
        
        const urlMapping = await migrator.migrateBatch(
          imageUrls,
          `mes-${courseId}`,
          (done, total) => {
            process.stdout.write(`\r   Progress: ${done}/${total}`);
          }
        );
        console.log('');
        
        imageUrlMapper = migrator.createUrlMapper(urlMapping);
        const stats = migrator.getStats();
        result.imagesMigrated = stats.migrated;
        result.imagesFailedCount = stats.failed;
      }
    }

    // 3. Transform to IgniteZero/LearnPlay format
    console.log('\n🔄 Transforming to LearnPlay format...');
    const course = transformLegacyCourse(legacyContent, {
      locale: options.locale,
      imageUrlMapper,
    });

    // Override ID to use mes- prefix
    course.id = `mes-${courseId}`;
    
    // Add organization scoping
    (course as any).organization_id = options.organizationId;
    (course as any).visibility = 'org';
    (course as any).source = 'mes';
    (course as any).source_course_id = courseId;

    result.itemsImported = course.items?.length || 0;
    result.studyTextsImported = course.studyTexts?.length || 0;

    console.log(`   Items: ${result.itemsImported}`);
    console.log(`   Study Texts: ${result.studyTextsImported}`);
    console.log(`   Groups: ${course.groups?.length || 0}`);

    // 4. Save to Supabase Storage
    if (!options.dryRun) {
      console.log('\n💾 Saving to Supabase Storage...');
      
      const courseJson = JSON.stringify({
        id: course.id,
        format: 'mes',
        version: 1,
        content: course,
      }, null, 2);
      
      const blob = new Blob([courseJson], { type: 'application/json' });
      const { error: uploadError } = await targetClient.storage
        .from('courses')
        .upload(`${course.id}/course.json`, blob, {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) {
        result.errors.push(`Storage upload failed: ${uploadError.message}`);
        return result;
      }

      // 5. Create course metadata record
      console.log('📋 Creating course metadata...');
      
      const { error: metaError } = await targetClient
        .from('course_metadata')
        .upsert({
          id: course.id,
          organization_id: options.organizationId,
          visibility: 'org',
          content_version: 1,
          tag_ids: [],
          tags: { 
            __format: 'mes',
            source: 'expertcollege',
            locale: options.locale,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id,organization_id' });

      if (metaError) {
        result.warnings.push(`Metadata insert warning: ${metaError.message}`);
      }

      console.log('✅ Course migrated successfully!');
    } else {
      console.log('\n⏭️  DRY RUN - skipping save');
    }

    result.success = true;
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error(`\n❌ Migration failed: ${errorMessage}`);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🚀 MES Content Migration Tool');
  console.log('━'.repeat(50));
  console.log('Source: Kevin\'s MES Supabase (yqpqdtedhoffgmurpped)');
  console.log('Target: Your LearnPlay Supabase');
  console.log('━'.repeat(50));

  // Load environment
  loadEnvFile('mes-migration.env');
  loadEnvFile('learnplay.env');
  loadLearnPlayEnv();

  const listMode = hasArg('--list');
  const dryRun = hasArg('--dry-run');
  const migrateImages = hasArg('--migrate-images');
  const allMode = hasArg('--all');
  const resume = hasArg('--resume');
  const courseIdArg = getArg('--courseId');
  const batchSize = getIntArg('--batch', 0);
  const locale = getArg('--locale') || 'nl'; // Dutch default for ExpertCollege
  const cpPath = path.resolve(process.cwd(), 'artifacts/mes-migration-checkpoint.json');

  // Create MES client
  const mesClient = createMesClient();

  // Test connection by listing courses
  console.log('\n📋 Testing MES connection...');
  let courses: MesCourse[];
  try {
    courses = await listMesCourses(mesClient);
    console.log(`✅ Connected! Found ${courses.length} courses in MES database.`);
  } catch (error) {
    console.error(`❌ Failed to connect to MES database: ${error}`);
    process.exit(1);
  }

  // List mode - just show courses
  if (listMode) {
    console.log('\n📋 Courses in MES database:\n');
    console.log('  ID     | Language | Name');
    console.log('  ' + '─'.repeat(70));
    for (const c of courses) {
      const lang = (c.mes_course_language || '??').padEnd(8);
      console.log(`  ${String(c.mes_course_id).padStart(5)} | ${lang} | ${c.mes_course_name}`);
    }
    console.log(`\n  Total: ${courses.length} courses`);
    return;
  }

  // For actual migration, we need target credentials
  const organizationId = mustEnv('ORGANIZATION_ID');
  const targetClient = dryRun ? null : createTargetClient();

  // Single course mode
  if (courseIdArg) {
    const courseId = parseInt(courseIdArg, 10);
    if (isNaN(courseId)) {
      console.error('❌ Invalid course ID');
      process.exit(1);
    }

    const result = await migrateSingleCourse(mesClient, targetClient!, courseId, {
      migrateImages,
      locale,
      dryRun,
      organizationId,
    });

    console.log('\n📊 Migration Result:');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Batch or all mode
  if (batchSize > 0 || allMode) {
    const coursesToProcess = allMode ? courses : courses.slice(0, batchSize);
    
    // Load checkpoint if resuming
    let cp = resume ? readCheckpoint(cpPath) : null;
    if (!cp) {
      cp = {
        version: 1,
        started_at: nowIso(),
        updated_at: nowIso(),
        last_course_id: 0,
        stats: {
          totalCourses: coursesToProcess.length,
          successCount: 0,
          failedCount: 0,
          itemsImported: 0,
          studyTextsImported: 0,
          imagesMigrated: 0,
          imagesFailedCount: 0,
          errors: [],
        },
      };
    }

    console.log(`\n📦 Migrating ${coursesToProcess.length} courses...`);
    if (resume && cp.last_course_id > 0) {
      console.log(`   Resuming from course ID > ${cp.last_course_id}`);
    }

    for (const course of coursesToProcess) {
      // Skip if already processed (resume mode)
      if (resume && course.mes_course_id <= cp.last_course_id) {
        continue;
      }

      const result = await migrateSingleCourse(mesClient, targetClient!, course.mes_course_id, {
        migrateImages,
        locale,
        dryRun,
        organizationId,
      });

      // Update stats
      if (result.success) {
        cp.stats.successCount++;
      } else {
        cp.stats.failedCount++;
        cp.stats.errors.push({
          courseId: course.mes_course_id,
          error: result.errors.join('; '),
        });
      }
      cp.stats.itemsImported += result.itemsImported;
      cp.stats.studyTextsImported += result.studyTextsImported;
      cp.stats.imagesMigrated += result.imagesMigrated;
      cp.stats.imagesFailedCount += result.imagesFailedCount;
      
      // Update checkpoint
      cp.last_course_id = course.mes_course_id;
      cp.updated_at = nowIso();
      writeCheckpoint(cpPath, cp);
    }

    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total courses attempted: ${cp.stats.successCount + cp.stats.failedCount}`);
    console.log(`Successful: ${cp.stats.successCount}`);
    console.log(`Failed: ${cp.stats.failedCount}`);
    console.log(`Items imported: ${cp.stats.itemsImported}`);
    console.log(`Study texts imported: ${cp.stats.studyTextsImported}`);
    if (migrateImages) {
      console.log(`Images migrated: ${cp.stats.imagesMigrated}`);
      console.log(`Images failed: ${cp.stats.imagesFailedCount}`);
    }

    if (cp.stats.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      for (const e of cp.stats.errors.slice(0, 10)) {
        console.log(`  - Course ${e.courseId}: ${e.error.slice(0, 100)}`);
      }
      if (cp.stats.errors.length > 10) {
        console.log(`  ... and ${cp.stats.errors.length - 10} more errors`);
      }
    }

    console.log(`\nCheckpoint saved to: ${path.relative(process.cwd(), cpPath)}`);
    return;
  }

  // No valid command - show help
  console.log(`
Usage:
  npx tsx scripts/migrate-mes-content.ts --list
  npx tsx scripts/migrate-mes-content.ts --courseId=169
  npx tsx scripts/migrate-mes-content.ts --batch=10
  npx tsx scripts/migrate-mes-content.ts --all
  npx tsx scripts/migrate-mes-content.ts --all --resume

Options:
  --list              List all courses in MES database
  --courseId=ID       Migrate a single course by ID
  --batch=N           Migrate first N courses
  --all               Migrate all courses
  --resume            Resume from last checkpoint
  --migrate-images    Download images from Azure and upload to Supabase
  --dry-run           Don't actually save, just preview
  --locale=nl         Set target locale (default: nl for Dutch)

Required environment variables:
  SUPABASE_URL               Your LearnPlay Supabase URL
  SUPABASE_SERVICE_ROLE_KEY  Your service role key
  ORGANIZATION_ID            Your organization ID

Optional environment variables:
  MES_SUPABASE_URL           Kevin's MES Supabase URL (has default)
  MES_ANON_KEY               Kevin's MES anon key (has default)
`);
}

// Run
main().catch(err => {
  console.error('💥 Migration failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

