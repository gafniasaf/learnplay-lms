#!/usr/bin/env tsx
/**
 * MES Migration Status Monitor
 * 
 * Shows real-time progress of the migration worker.
 * 
 * Usage:
 *   npx tsx scripts/mes-migration-status.ts           # Show status once
 *   npx tsx scripts/mes-migration-status.ts --watch   # Live updates
 *   npx tsx scripts/mes-migration-status.ts --reset   # Reset checkpoint
 */

import fs from 'node:fs';
import path from 'node:path';

const STATUS_PATH = path.resolve(process.cwd(), 'artifacts/mes-migration-status.json');
const CHECKPOINT_PATH = path.resolve(process.cwd(), 'artifacts/mes-migration-checkpoint.json');
const LOCK_PATH = path.resolve(process.cwd(), 'artifacts/mes-migration.lock');

const HANG_TIMEOUT_MS = 120000; // 2 minutes

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

function readStatus(): MigrationStatus | null {
  if (!fs.existsSync(STATUS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString();
}

function isWorkerHung(status: MigrationStatus): boolean {
  if (status.state !== 'running') return false;
  const lastHB = new Date(status.last_heartbeat).getTime();
  return Date.now() - lastHB > HANG_TIMEOUT_MS;
}

function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

function printStatus(status: MigrationStatus): void {
  const now = new Date();
  const stateColors: Record<string, string> = {
    'idle': '\x1b[90m',
    'running': '\x1b[32m',
    'paused': '\x1b[33m',
    'completed': '\x1b[36m',
    'error': '\x1b[31m',
  };
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  
  let displayState = status.state;
  let stateColor = stateColors[status.state] || '';
  
  if (isWorkerHung(status)) {
    displayState = 'HUNG';
    stateColor = '\x1b[31m';
  }

  console.log('');
  console.log(`${bold}╔══════════════════════════════════════════════════════════╗${reset}`);
  console.log(`${bold}║         MES CONTENT MIGRATION STATUS                     ║${reset}`);
  console.log(`${bold}╚══════════════════════════════════════════════════════════╝${reset}`);
  console.log('');
  console.log(`  State: ${stateColor}${bold}${displayState.toUpperCase()}${reset}`);
  console.log(`  PID: ${status.pid || 'N/A'}`);
  console.log(`  Last Heartbeat: ${formatTimestamp(status.last_heartbeat)}`);
  console.log('');
  
  // Progress bar
  const progress = status.total_courses > 0 
    ? Math.round((status.processed / status.total_courses) * 100) 
    : 0;
  const barWidth = 40;
  const filled = Math.floor(progress / 100 * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  console.log(`  Progress: [${bar}] ${progress}%`);
  console.log(`            ${status.processed} / ${status.total_courses} courses`);
  console.log('');
  
  // Stats
  console.log(`  ┌─────────────────────────────────────────────────────────┐`);
  console.log(`  │ ${bold}Statistics${reset}                                              │`);
  console.log(`  ├─────────────────────────────────────────────────────────┤`);
  console.log(`  │ Successful: ${String(status.successful).padEnd(10)} Items: ${String(status.items_imported).padEnd(10)}  │`);
  console.log(`  │ Failed:     ${String(status.failed).padEnd(10)} Study Texts: ${String(status.study_texts_imported).padEnd(5)} │`);
  if (status.images_migrated > 0 || status.images_failed > 0) {
    console.log(`  │ Images:     ${String(status.images_migrated).padEnd(10)} Images Failed: ${String(status.images_failed).padEnd(3)} │`);
  }
  console.log(`  └─────────────────────────────────────────────────────────┘`);
  console.log('');
  
  // Current course
  if (status.current_course_id !== null) {
    console.log(`  Current: [${status.current_course_id}] ${status.current_course_name?.slice(0, 40) || 'Unknown'}...`);
  }
  
  // ETA
  if (status.eta_seconds !== null && status.state === 'running') {
    console.log(`  ETA: ${formatDuration(status.eta_seconds)}`);
    if (status.avg_course_time_ms) {
      console.log(`  Avg Time: ${Math.round(status.avg_course_time_ms)}ms per course`);
    }
  }
  console.log('');
  
  // Recent errors
  if (status.errors.length > 0) {
    console.log(`  ${bold}Recent Errors:${reset}`);
    for (const err of status.errors.slice(-5)) {
      console.log(`    \x1b[31m✗\x1b[0m [${err.courseId}] ${err.error.slice(0, 50)}`);
    }
    console.log('');
  }
  
  // Instructions
  if (displayState === 'HUNG') {
    console.log('  \x1b[33m⚠️  Worker appears hung! Restart with:\x1b[0m');
    console.log('     npx tsx scripts/mes-migration-worker.ts');
    console.log('');
  } else if (status.state === 'paused') {
    console.log('  \x1b[33mℹ️  Migration paused. Resume with:\x1b[0m');
    console.log('     npx tsx scripts/mes-migration-worker.ts');
    console.log('');
  } else if (status.state === 'idle') {
    console.log('  \x1b[90mℹ️  No migration running. Start with:\x1b[0m');
    console.log('     npx tsx scripts/mes-migration-worker.ts');
    console.log('');
  } else if (status.state === 'completed') {
    console.log('  \x1b[36m✓ Migration completed successfully!\x1b[0m');
    console.log('');
  }
  
  console.log(`  Updated: ${now.toLocaleTimeString()}`);
  console.log('');
}

async function main(): Promise<void> {
  const watchMode = process.argv.includes('--watch');
  const reset = process.argv.includes('--reset');

  if (reset) {
    console.log('🗑️  Resetting migration state...');
    if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
    if (fs.existsSync(STATUS_PATH)) fs.unlinkSync(STATUS_PATH);
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    console.log('✅ Reset complete. Run worker to start fresh.');
    return;
  }

  const status = readStatus();
  
  if (!status) {
    console.log('');
    console.log('⚠️  No migration status found.');
    console.log('   Start migration with: npx tsx scripts/mes-migration-worker.ts');
    console.log('');
    return;
  }

  if (!watchMode) {
    printStatus(status);
    return;
  }

  // Watch mode - refresh every 2 seconds
  console.log('👁️  Watching migration status (Ctrl+C to stop)...\n');
  
  while (true) {
    const currentStatus = readStatus();
    if (currentStatus) {
      clearScreen();
      printStatus(currentStatus);
      
      if (currentStatus.state === 'completed' || currentStatus.state === 'error') {
        console.log('  Exiting watch mode (migration ended)');
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(console.error);

