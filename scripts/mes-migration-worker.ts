#!/usr/bin/env tsx
/**
 * MES Content Migration Worker
 * 
 * Robust background worker with:
 * - Auto-resume from checkpoint
 * - Real-time progress display
 * - Heartbeat for hang detection
 * - Graceful shutdown handling
 * 
 * Usage:
 *   npx tsx scripts/mes-migration-worker.ts
 *   npx tsx scripts/mes-migration-worker.ts --migrate-images
 * 
 * Monitor progress:
 *   npx tsx scripts/mes-migration-status.ts --watch
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';
import { transformLegacyCourse, extractImageUrls } from './legacy-import/transform';
import { ImageMigrator, normalizeLegacyImageUrl } from './legacy-import/image-migrator';
import type { LegacyCourseContent, ImportResult } from './legacy-import/types';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// NOTE: No defaults here (ABSOLUTE NO-FALLBACK POLICY). Use `mes-migration.env` locally.

const CHECKPOINT_PATH = path.resolve(process.cwd(), 'artifacts/mes-migration-checkpoint.json');
const STATUS_PATH = path.resolve(process.cwd(), 'artifacts/mes-migration-status.json');
const LOCK_PATH = path.resolve(process.cwd(), 'artifacts/mes-migration.lock');

const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const HANG_TIMEOUT_MS = 120000; // 2 minutes - if no heartbeat, consider hung
const RETRY_DELAY_MS = 5000; // Wait 5s before retrying failed course
const MAX_RETRIES_PER_COURSE = 3;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MesCourse {
  mes_course_id: number;
  mes_course_name: string;
  mes_course_language: string | null;
  mes_course_type: string | null;
}

interface MigrationStatus {
  version: 1;
  state: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  pid: number | null;
  started_at: string | null;
  last_heartbeat: string;
  current_course_id: number | null;
  current_course_name: string | null;
  total_courses: number;
  processed: number;
  successful: number;
  failed: number;
  items_imported: number;
  study_texts_imported: number;
  images_migrated: number;
  images_failed: number;
  eta_seconds: number | null;
  avg_course_time_ms: number | null;
  errors: Array<{ courseId: number; name: string; error: string; at: string }>;
  last_error: string | null;
}

interface Checkpoint {
  version: 1;
  started_at: string;
  updated_at: string;
  last_course_id: number;
  processed_ids: number[];
  failed_ids: Record<number, { retries: number; lastError: string; lastAttempt: string }>;
  stats: {
    successCount: number;
    failedCount: number;
    itemsImported: number;
    studyTextsImported: number;
    imagesMigrated: number;
    imagesFailedCount: number;
  };
  courseTimes: number[]; // Track last 20 course processing times for ETA
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
    console.error(`❌ BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
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

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

function readCheckpoint(): Checkpoint {
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
      if (data && data.version === 1) {
        return data;
      }
    } catch { /* ignore */ }
  }
  
  return {
    version: 1,
    started_at: nowIso(),
    updated_at: nowIso(),
    last_course_id: -1,
    processed_ids: [],
    failed_ids: {},
    stats: {
      successCount: 0,
      failedCount: 0,
      itemsImported: 0,
      studyTextsImported: 0,
      imagesMigrated: 0,
      imagesFailedCount: 0,
    },
    courseTimes: [],
  };
}

function saveCheckpoint(cp: Checkpoint): void {
  ensureDir(CHECKPOINT_PATH);
  cp.updated_at = nowIso();
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2) + '\n', 'utf8');
}

function readStatus(): MigrationStatus {
  if (fs.existsSync(STATUS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    } catch { /* ignore */ }
  }
  
  return createInitialStatus();
}

function createInitialStatus(): MigrationStatus {
  return {
    version: 1,
    state: 'idle',
    pid: null,
    started_at: null,
    last_heartbeat: nowIso(),
    current_course_id: null,
    current_course_name: null,
    total_courses: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    items_imported: 0,
    study_texts_imported: 0,
    images_migrated: 0,
    images_failed: 0,
    eta_seconds: null,
    avg_course_time_ms: null,
    errors: [],
    last_error: null,
  };
}

function saveStatus(status: MigrationStatus): void {
  ensureDir(STATUS_PATH);
  status.last_heartbeat = nowIso();
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n', 'utf8');
}

function acquireLock(): boolean {
  ensureDir(LOCK_PATH);
  
  // Check if another instance is running
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
      const lockAge = Date.now() - new Date(lockData.timestamp).getTime();
      
      // If lock is fresh (less than hang timeout), another instance is running
      if (lockAge < HANG_TIMEOUT_MS) {
        return false;
      }
      
      // Stale lock - previous instance likely crashed
      console.log('⚠️ Stale lock detected, taking over...');
    } catch { /* ignore bad lock file */ }
  }
  
  // Acquire lock
  fs.writeFileSync(LOCK_PATH, JSON.stringify({
    pid: process.pid,
    timestamp: nowIso(),
  }), 'utf8');
  
  return true;
}

function updateLock(): void {
  if (fs.existsSync(LOCK_PATH)) {
    fs.writeFileSync(LOCK_PATH, JSON.stringify({
      pid: process.pid,
      timestamp: nowIso(),
    }), 'utf8');
  }
}

function releaseLock(): void {
  if (fs.existsSync(LOCK_PATH)) {
    fs.unlinkSync(LOCK_PATH);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

function createMesClient(): SupabaseClient {
  const url = mustEnv('MES_SUPABASE_URL');
  const key = mustEnv('MES_ANON_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function createTargetClient(): SupabaseClient {
  const url = mustEnv('SUPABASE_URL');
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listMesCourses(client: SupabaseClient): Promise<MesCourse[]> {
  const allCourses: MesCourse[] = [];
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await client
      .from('mes_course')
      .select('mes_course_id, mes_course_name, mes_course_language, mes_course_type')
      .order('mes_course_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    
    if (error) throw new Error(`Failed to list courses: ${error.message}`);
    if (!data || data.length === 0) break;
    
    allCourses.push(...data as MesCourse[]);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  
  return allCourses;
}

async function getMesCourseContent(client: SupabaseClient, courseId: number): Promise<LegacyCourseContent | null> {
  const { data, error } = await client.rpc('get_course_content', { p_course_id: courseId });
  if (error) {
    throw new Error(`RPC error: ${error.message}`);
  }
  return data as LegacyCourseContent;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function migrateCourse(
  mesClient: SupabaseClient,
  targetClient: SupabaseClient,
  course: MesCourse,
  options: { migrateImages: boolean; locale: string; organizationId: string }
): Promise<ImportResult> {
  const result: ImportResult = {
    courseId: `mes-${course.mes_course_id}`,
    success: false,
    itemsImported: 0,
    studyTextsImported: 0,
    imagesMigrated: 0,
    imagesFailedCount: 0,
    errors: [],
    warnings: [],
  };

  // Fetch content
  const legacyContent = await getMesCourseContent(mesClient, course.mes_course_id);
  
  if (!legacyContent || !legacyContent.course || legacyContent.course.length === 0) {
    result.errors.push('Course not found or empty');
    return result;
  }

  // Migrate images if requested
  let imageUrlMapper: ((url: string) => string) | undefined;
  if (options.migrateImages) {
    const imageUrls = extractImageUrls(legacyContent).map(normalizeLegacyImageUrl);
    if (imageUrls.length > 0) {
      const targetUrl = mustEnv('SUPABASE_URL');
      const targetKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
      const migrator = new ImageMigrator(targetUrl, targetKey);
      const urlMapping = await migrator.migrateBatch(imageUrls, `mes-${course.mes_course_id}`);
      imageUrlMapper = migrator.createUrlMapper(urlMapping);
      const stats = migrator.getStats();
      result.imagesMigrated = stats.migrated;
      result.imagesFailedCount = stats.failed;
    }
  }

  // Transform
  const transformed = transformLegacyCourse(legacyContent, {
    locale: options.locale,
    imageUrlMapper,
  });
  
  transformed.id = `mes-${course.mes_course_id}`;
  (transformed as any).organization_id = options.organizationId;
  (transformed as any).visibility = 'org';
  (transformed as any).source = 'mes';
  (transformed as any).source_course_id = course.mes_course_id;

  result.itemsImported = transformed.items?.length || 0;
  result.studyTextsImported = transformed.studyTexts?.length || 0;

  // Save to storage
  const courseJson = JSON.stringify({
    id: transformed.id,
    format: 'mes',
    version: 1,
    content: transformed,
  }, null, 2);
  
  const blob = new Blob([courseJson], { type: 'application/json' });
  const { error: uploadError } = await targetClient.storage
    .from('courses')
    .upload(`${transformed.id}/course.json`, blob, {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadError) {
    result.errors.push(`Storage upload failed: ${uploadError.message}`);
    return result;
  }

  // Save metadata
  const { error: metaError } = await targetClient
    .from('course_metadata')
    .upsert({
      id: transformed.id,
      organization_id: options.organizationId,
      visibility: 'org',
      content_version: 1,
      tag_ids: [],
      tags: { __format: 'mes', source: 'expertcollege', locale: options.locale },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id,organization_id' });

  if (metaError) {
    result.warnings.push(`Metadata warning: ${metaError.message}`);
  }

  result.success = true;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WORKER LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function runWorker(): Promise<void> {
  const migrateImages = hasArg('--migrate-images');
  const locale = 'nl';

  // Load environment
  loadEnvFile('mes-migration.env');
  loadEnvFile('learnplay.env');
  loadLearnPlayEnv();

  const organizationId = mustEnv('ORGANIZATION_ID');

  // Try to acquire lock
  if (!acquireLock()) {
    console.log('⚠️ Another migration instance is already running.');
    console.log('   Run: npx tsx scripts/mes-migration-status.ts --watch');
    process.exit(0);
  }

  // Setup graceful shutdown
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n⏹️ Shutting down gracefully...');
    const status = readStatus();
    status.state = 'paused';
    saveStatus(status);
    releaseLock();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initialize clients
  console.log('🚀 MES Migration Worker Starting...\n');
  const mesClient = createMesClient();
  const targetClient = createTargetClient();

  // Fetch all courses
  console.log('📋 Fetching course list...');
  const allCourses = await listMesCourses(mesClient);
  console.log(`   Found ${allCourses.length} courses\n`);

  // Load checkpoint
  const checkpoint = readCheckpoint();
  
  // Initialize status
  const status = readStatus();
  status.state = 'running';
  status.pid = process.pid;
  status.started_at = checkpoint.started_at;
  status.total_courses = allCourses.length;
  status.processed = checkpoint.processed_ids.length;
  status.successful = checkpoint.stats.successCount;
  status.failed = checkpoint.stats.failedCount;
  status.items_imported = checkpoint.stats.itemsImported;
  status.study_texts_imported = checkpoint.stats.studyTextsImported;
  status.images_migrated = checkpoint.stats.imagesMigrated;
  status.images_failed = checkpoint.stats.imagesFailedCount;
  saveStatus(status);

  // Heartbeat interval
  const heartbeatTimer = setInterval(() => {
    updateLock();
    const s = readStatus();
    s.last_heartbeat = nowIso();
    saveStatus(s);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // Process courses
    for (const course of allCourses) {
      if (shuttingDown) break;

      // Skip already processed
      if (checkpoint.processed_ids.includes(course.mes_course_id)) {
        continue;
      }

      // Check if failed too many times
      const failInfo = checkpoint.failed_ids[course.mes_course_id];
      if (failInfo && failInfo.retries >= MAX_RETRIES_PER_COURSE) {
        continue;
      }

      // Update status
      status.current_course_id = course.mes_course_id;
      status.current_course_name = course.mes_course_name;
      saveStatus(status);

      const startTime = Date.now();
      
      // Progress bar
      const progress = Math.round((checkpoint.processed_ids.length / allCourses.length) * 100);
      const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
      console.log(`[${bar}] ${progress}% | Course ${course.mes_course_id}: ${course.mes_course_name.slice(0, 40)}...`);

      try {
        const result = await migrateCourse(mesClient, targetClient, course, {
          migrateImages,
          locale,
          organizationId,
        });

        const elapsed = Date.now() - startTime;
        
        if (result.success) {
          checkpoint.stats.successCount++;
          checkpoint.stats.itemsImported += result.itemsImported;
          checkpoint.stats.studyTextsImported += result.studyTextsImported;
          checkpoint.stats.imagesMigrated += result.imagesMigrated;
          checkpoint.stats.imagesFailedCount += result.imagesFailedCount;
          delete checkpoint.failed_ids[course.mes_course_id];
          console.log(`   ✅ OK (${result.itemsImported} items, ${result.studyTextsImported} texts) [${elapsed}ms]`);
        } else {
          throw new Error(result.errors.join('; ') || 'Unknown error');
        }

        // Track timing for ETA
        checkpoint.courseTimes.push(elapsed);
        if (checkpoint.courseTimes.length > 20) {
          checkpoint.courseTimes.shift();
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`   ❌ FAILED: ${errorMsg.slice(0, 60)}`);

        // Track failure
        const existing = checkpoint.failed_ids[course.mes_course_id];
        checkpoint.failed_ids[course.mes_course_id] = {
          retries: (existing?.retries || 0) + 1,
          lastError: errorMsg,
          lastAttempt: nowIso(),
        };
        checkpoint.stats.failedCount++;

        // Add to status errors
        status.errors.push({
          courseId: course.mes_course_id,
          name: course.mes_course_name,
          error: errorMsg.slice(0, 200),
          at: nowIso(),
        });
        if (status.errors.length > 50) {
          status.errors = status.errors.slice(-50);
        }
        status.last_error = errorMsg;

        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }

      // Mark as processed
      checkpoint.processed_ids.push(course.mes_course_id);
      checkpoint.last_course_id = course.mes_course_id;
      saveCheckpoint(checkpoint);

      // Update status with ETA
      status.processed = checkpoint.processed_ids.length;
      status.successful = checkpoint.stats.successCount;
      status.failed = checkpoint.stats.failedCount;
      status.items_imported = checkpoint.stats.itemsImported;
      status.study_texts_imported = checkpoint.stats.studyTextsImported;
      status.images_migrated = checkpoint.stats.imagesMigrated;
      status.images_failed = checkpoint.stats.imagesFailedCount;
      
      if (checkpoint.courseTimes.length > 0) {
        status.avg_course_time_ms = checkpoint.courseTimes.reduce((a, b) => a + b, 0) / checkpoint.courseTimes.length;
        const remaining = allCourses.length - checkpoint.processed_ids.length;
        status.eta_seconds = Math.round((remaining * status.avg_course_time_ms) / 1000);
      }
      saveStatus(status);
    }

    // Complete
    console.log('\n🎉 Migration complete!');
    status.state = 'completed';
    status.current_course_id = null;
    status.current_course_name = null;
    saveStatus(status);

  } finally {
    clearInterval(heartbeatTimer);
    releaseLock();
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total processed: ${checkpoint.processed_ids.length}`);
  console.log(`Successful: ${checkpoint.stats.successCount}`);
  console.log(`Failed: ${checkpoint.stats.failedCount}`);
  console.log(`Items: ${checkpoint.stats.itemsImported}`);
  console.log(`Study Texts: ${checkpoint.stats.studyTextsImported}`);
  if (migrateImages) {
    console.log(`Images: ${checkpoint.stats.imagesMigrated} (${checkpoint.stats.imagesFailedCount} failed)`);
  }
}

// Run
runWorker().catch(err => {
  console.error('💥 Worker crashed:', err instanceof Error ? err.message : String(err));
  
  const status = readStatus();
  status.state = 'error';
  status.last_error = err instanceof Error ? err.message : String(err);
  saveStatus(status);
  
  releaseLock();
  process.exit(1);
});

