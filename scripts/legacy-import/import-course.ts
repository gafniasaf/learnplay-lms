/**
 * Legacy Course Import Script
 * 
 * Usage:
 *   npx tsx scripts/legacy-import/import-course.ts --courseId=169
 *   npx tsx scripts/legacy-import/import-course.ts --list
 *   npx tsx scripts/legacy-import/import-course.ts --batch=10
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { transformLegacyCourse, extractImageUrls } from './transform.ts';
import { ImageMigrator, normalizeLegacyImageUrl } from './image-migrator.ts';
import type { LegacyCourseContent, ImportResult } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEGACY_DB_URL = Deno.env.get('LEGACY_DATABASE_URL') || 
  'postgresql://postgres:d584WwaNjJbcQxHs@db.yqpqdtedhoffgmurpped.supabase.co:5432/postgres';

const TARGET_SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL');
const TARGET_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const DEFAULT_LOCALE = 'he'; // Hebrew as default based on legacy system

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY DATABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

async function createLegacyClient() {
  // Use pg directly for legacy database
  const { Pool } = await import('npm:pg@8.11.3');
  return new Pool({ connectionString: LEGACY_DB_URL });
}

async function fetchLegacyCourseContent(pool: any, courseId: number): Promise<LegacyCourseContent> {
  const result = await pool.query('SELECT get_course_content($1)', [courseId]);
  return result.rows[0].get_course_content;
}

async function listLegacyCourses(pool: any, limit = 20): Promise<{ id: number; name: string }[]> {
  const result = await pool.query(`
    SELECT mes_course_id as id, mes_course_name as name 
    FROM mes_course 
    ORDER BY mes_course_id 
    LIMIT $1
  `, [limit]);
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// TARGET SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function createTargetClient() {
  if (!TARGET_SUPABASE_URL || !TARGET_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(TARGET_SUPABASE_URL, TARGET_SERVICE_KEY);
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function importSingleCourse(
  legacyPool: any,
  targetClient: any,
  courseId: number,
  options: {
    migrateImages: boolean;
    locale: string;
    dryRun: boolean;
  }
): Promise<ImportResult> {
  const result: ImportResult = {
    courseId: `legacy-${courseId}`,
    success: false,
    itemsImported: 0,
    studyTextsImported: 0,
    imagesMigrated: 0,
    imagesFailedCount: 0,
    errors: [],
    warnings: [],
  };

  try {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📚 Importing course ID: ${courseId}`);
    console.log(`${'═'.repeat(60)}`);

    // 1. Fetch legacy content
    console.log('\n📥 Fetching legacy course content...');
    const legacyContent = await fetchLegacyCourseContent(legacyPool, courseId);
    
    if (!legacyContent.course || legacyContent.course.length === 0) {
      result.errors.push('Course not found in legacy database');
      return result;
    }

    console.log(`   Course: ${legacyContent.course[0].name}`);
    console.log(`   Topics: ${legacyContent.topics?.length || 0}`);
    console.log(`   Subjects: ${legacyContent.subjects?.length || 0}`);

    // 2. Extract and migrate images
    let imageUrlMapper: ((url: string) => string) | undefined;
    
    if (options.migrateImages) {
      console.log('\n🖼️  Extracting images...');
      const imageUrls = extractImageUrls(legacyContent).map(normalizeLegacyImageUrl);
      console.log(`   Found ${imageUrls.length} images`);

      if (imageUrls.length > 0 && !options.dryRun) {
        const migrator = new ImageMigrator(TARGET_SUPABASE_URL!, TARGET_SERVICE_KEY!);
        const urlMapping = await migrator.migrateBatch(
          imageUrls,
          `legacy-${courseId}`,
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

    // 3. Transform to IgniteZero format
    console.log('\n🔄 Transforming to IgniteZero format...');
    const course = transformLegacyCourse(legacyContent, {
      locale: options.locale,
      imageUrlMapper,
    });

    result.itemsImported = course.items.length;
    result.studyTextsImported = course.studyTexts.length;

    console.log(`   Items: ${course.items.length}`);
    console.log(`   Study texts: ${course.studyTexts.length}`);
    console.log(`   Groups: ${course.groups.length}`);

    // 4. Save to Supabase Storage
    if (!options.dryRun) {
      console.log('\n💾 Saving to Supabase Storage...');
      
      const { error: uploadError } = await targetClient.storage
        .from('courses')
        .upload(`${course.id}.json`, JSON.stringify(course, null, 2), {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) {
        result.errors.push(`Storage upload failed: ${uploadError.message}`);
        return result;
      }

      // 5. Create course metadata record
      console.log('📋 Creating course metadata...');
      const organizationId = Deno.env.get('ORGANIZATION_ID');
      
      if (organizationId) {
        const { error: metaError } = await targetClient
          .from('course_metadata')
          .upsert({
            id: course.id,
            title: course.title,
            organization_id: organizationId,
            status: 'draft',
            subject: course.subject,
            grade_band: course.gradeBand,
            locale: course.locale,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (metaError) {
          result.warnings.push(`Metadata insert warning: ${metaError.message}`);
        }
      } else {
        result.warnings.push('No ORGANIZATION_ID set - skipping metadata insert');
      }

      console.log('✅ Course imported successfully!');
    } else {
      console.log('\n⏭️  DRY RUN - skipping save');
    }

    result.success = true;
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error(`\n❌ Import failed: ${errorMessage}`);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = Deno.args;
  
  // Parse arguments
  const courseIdArg = args.find(a => a.startsWith('--courseId='));
  const listArg = args.includes('--list');
  const batchArg = args.find(a => a.startsWith('--batch='));
  const dryRun = args.includes('--dry-run');
  const skipImages = args.includes('--skip-images');
  const locale = args.find(a => a.startsWith('--locale='))?.split('=')[1] || DEFAULT_LOCALE;

  console.log('\n🚀 Legacy Course Import Tool');
  console.log('━'.repeat(40));

  // Validate environment
  if (!TARGET_SUPABASE_URL) {
    console.error('❌ SUPABASE_URL or VITE_SUPABASE_URL is required');
    Deno.exit(1);
  }
  if (!TARGET_SERVICE_KEY && !dryRun) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required (or use --dry-run)');
    Deno.exit(1);
  }

  // Connect to legacy database
  console.log('\n📡 Connecting to legacy database...');
  const legacyPool = await createLegacyClient();
  
  try {
    // List courses
    if (listArg) {
      console.log('\n📋 Available courses in legacy system:\n');
      const courses = await listLegacyCourses(legacyPool, 50);
      for (const c of courses) {
        console.log(`  ${c.id.toString().padStart(4)}  ${c.name}`);
      }
      return;
    }

    // Import single course
    if (courseIdArg) {
      const courseId = parseInt(courseIdArg.split('=')[1], 10);
      const targetClient = dryRun ? null : createTargetClient();
      
      const result = await importSingleCourse(legacyPool, targetClient, courseId, {
        migrateImages: !skipImages,
        locale,
        dryRun,
      });

      console.log('\n📊 Import Result:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Batch import
    if (batchArg) {
      const batchSize = parseInt(batchArg.split('=')[1], 10) || 10;
      const targetClient = dryRun ? null : createTargetClient();
      
      console.log(`\n📦 Batch importing first ${batchSize} courses...`);
      const courses = await listLegacyCourses(legacyPool, batchSize);
      
      const results: ImportResult[] = [];
      for (const course of courses) {
        const result = await importSingleCourse(legacyPool, targetClient, course.id, {
          migrateImages: !skipImages,
          locale,
          dryRun,
        });
        results.push(result);
      }

      // Summary
      console.log('\n' + '═'.repeat(60));
      console.log('📊 BATCH IMPORT SUMMARY');
      console.log('═'.repeat(60));
      console.log(`Total courses: ${results.length}`);
      console.log(`Successful: ${results.filter(r => r.success).length}`);
      console.log(`Failed: ${results.filter(r => !r.success).length}`);
      console.log(`Items imported: ${results.reduce((sum, r) => sum + r.itemsImported, 0)}`);
      console.log(`Study texts imported: ${results.reduce((sum, r) => sum + r.studyTextsImported, 0)}`);
      console.log(`Images migrated: ${results.reduce((sum, r) => sum + r.imagesMigrated, 0)}`);
      
      const allErrors = results.flatMap(r => r.errors);
      if (allErrors.length > 0) {
        console.log('\n⚠️  Errors:');
        allErrors.forEach(e => console.log(`  - ${e}`));
      }
      return;
    }

    // No valid command
    console.log(`
Usage:
  npx tsx scripts/legacy-import/import-course.ts --list
  npx tsx scripts/legacy-import/import-course.ts --courseId=169
  npx tsx scripts/legacy-import/import-course.ts --batch=10
  
Options:
  --dry-run       Don't actually save, just preview
  --skip-images   Don't migrate images
  --locale=he     Set target locale (default: he)
`);

  } finally {
    await legacyPool.end();
  }
}

// Run
main().catch(console.error);

