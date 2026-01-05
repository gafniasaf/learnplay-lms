import { createClient } from '@supabase/supabase-js';
import { loadLocalEnvForTests } from '../../tests/helpers/load-local-env';

loadLocalEnvForTests();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const POLL_INTERVAL = 3000; // 3 seconds
const BOOK_FILTER = process.argv[2] || null; // Optional: filter by book ID

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'queued': return '⏳';
    case 'in_progress': return '🔄';
    case 'done': return '✅';
    case 'failed': return '❌';
    default: return '❓';
  }
}

function formatDuration(start: string, end?: string): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diff = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
  
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

async function fetchJobs() {
  let query = supabase
    .from('ai_agent_jobs')
    .select('id, job_type, status, created_at, updated_at, payload, error')
    .in('job_type', ['book_generate_chapter', 'book_generate_section', 'book_generate_full'])
    .order('created_at', { ascending: false })
    .limit(30);

  if (BOOK_FILTER) {
    query = query.or(`payload->>bookId.eq.${BOOK_FILTER},payload->payload->>bookId.eq.${BOOK_FILTER}`);
  }

  const { data: jobs, error } = await query;
  return { jobs, error };
}

async function fetchStats() {
  const { data, error } = await supabase
    .from('ai_agent_jobs')
    .select('status')
    .in('job_type', ['book_generate_chapter', 'book_generate_section', 'book_generate_full']);

  if (error || !data) return { queued: 0, in_progress: 0, done: 0, failed: 0 };

  return {
    queued: data.filter(j => j.status === 'queued').length,
    in_progress: data.filter(j => j.status === 'in_progress').length,
    done: data.filter(j => j.status === 'done').length,
    failed: data.filter(j => j.status === 'failed').length,
  };
}

async function monitor() {
  clearScreen();
  
  const now = new Date().toLocaleTimeString();
  const { jobs, error } = await fetchJobs();
  const stats = await fetchStats();

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║               📚 BOOK GENERATION LIVE MONITOR                                ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  🕐 ${now}    ${BOOK_FILTER ? `📖 Filter: ${BOOK_FILTER}` : '📖 All Books'}`.padEnd(79) + '║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  ⏳ Queued: ${stats.queued.toString().padStart(3)}   🔄 In Progress: ${stats.in_progress.toString().padStart(3)}   ✅ Done: ${stats.done.toString().padStart(4)}   ❌ Failed: ${stats.failed.toString().padStart(3)}  ║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

  if (error) {
    console.log(`║  ❌ Error: ${error.message}`.padEnd(79) + '║');
  } else if (!jobs || jobs.length === 0) {
    console.log('║  No jobs found.'.padEnd(79) + '║');
  } else {
    // Group by status for better visibility
    const activeJobs = jobs.filter(j => j.status === 'in_progress' || j.status === 'queued');
    const recentCompleted = jobs.filter(j => j.status === 'done').slice(0, 5);
    const recentFailed = jobs.filter(j => j.status === 'failed').slice(0, 3);

    if (activeJobs.length > 0) {
      console.log('║  ──────────────────── ACTIVE ────────────────────────────────────────────────║');
      for (const job of activeJobs) {
        const emoji = statusEmoji(job.status);
        const type = job.job_type.replace('book_generate_', '').padEnd(8);
        const topic = (job.payload?.topic || job.payload?.payload?.topic || 'N/A').slice(0, 30).padEnd(30);
        const duration = formatDuration(job.created_at, job.updated_at);
        const chIdx = job.payload?.chapterIndex ?? job.payload?.payload?.chapterIndex ?? '';
        const secIdx = job.payload?.sectionIndex ?? job.payload?.payload?.sectionIndex ?? '';
        const idx = chIdx !== '' ? `Ch${chIdx}${secIdx !== '' ? `.${secIdx}` : ''}`.padEnd(6) : ''.padEnd(6);
        
        console.log(`║  ${emoji} ${type} ${idx} ${topic} ${duration.padStart(8)} ║`);
      }
    }

    if (recentCompleted.length > 0) {
      console.log('║  ──────────────────── RECENT DONE ──────────────────────────────────────────-║');
      for (const job of recentCompleted) {
        const type = job.job_type.replace('book_generate_', '').padEnd(8);
        const topic = (job.payload?.topic || job.payload?.payload?.topic || 'N/A').slice(0, 35).padEnd(35);
        const chIdx = job.payload?.chapterIndex ?? job.payload?.payload?.chapterIndex ?? '';
        const secIdx = job.payload?.sectionIndex ?? job.payload?.payload?.sectionIndex ?? '';
        const idx = chIdx !== '' ? `Ch${chIdx}${secIdx !== '' ? `.${secIdx}` : ''}`.padEnd(6) : ''.padEnd(6);
        
        console.log(`║  ✅ ${type} ${idx} ${topic}   ║`);
      }
    }

    if (recentFailed.length > 0) {
      console.log('║  ──────────────────── RECENT FAILED ────────────────────────────────────────-║');
      for (const job of recentFailed) {
        const type = job.job_type.replace('book_generate_', '').padEnd(8);
        const errMsg = (job.error || 'Unknown error').slice(0, 45).padEnd(45);
        
        console.log(`║  ❌ ${type} ${errMsg}   ║`);
      }
    }
  }

  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  Press Ctrl+C to exit                                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
}

async function run() {
  console.log('Starting live monitor... (Ctrl+C to exit)');
  
  // Initial fetch
  await monitor();

  // Poll loop
  setInterval(async () => {
    try {
      await monitor();
    } catch (e) {
      console.error('Monitor error:', e);
    }
  }, POLL_INTERVAL);
}

run();

