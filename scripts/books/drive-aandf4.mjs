
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnvForTests } from '../../tests/helpers/load-local-env';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

loadLocalEnvForTests();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const BOOK_ID = 'mbo-aandf-4';

async function main() {
  console.log(`🚀 Focusing on book: ${BOOK_ID}`);

  // 1. Check active jobs
  const { data: activeJobs } = await supabase
    .from('ai_agent_jobs')
    .select('id, status, job_type')
    .or(`payload->>bookId.eq.${BOOK_ID},payload->payload->>bookId.eq.${BOOK_ID}`)
    .in('status', ['queued', 'in_progress'])
    .order('created_at', { ascending: false });

  if (activeJobs && activeJobs.length > 0) {
    console.log(`found ${activeJobs.length} active jobs. Resuming driver...`);
  } else {
    console.log('No active jobs. Enqueuing root chapter job (index 0)...');
    
    // Call the edge function to enqueue
    // We can use the 'enqueue-job' tool or just insert directly if we have service key? 
    // Better to use the proper queue mechanism via RPC or direct insert if we duplicate logic.
    // Let's just insert directly to 'ai_agent_jobs' as 'queued' to be safe and simple.
    
    const payload = {
      bookId: BOOK_ID,
      chapterIndex: 0,
      topic: 'MBO A&F 4 - Chapter 1 (Restart)'
    };

    const { data, error } = await supabase
      .from('ai_agent_jobs')
      .insert({
        job_type: 'book_generate_chapter',
        status: 'queued',
        payload: payload
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to enqueue root job:', error);
      process.exit(1);
    }
    console.log('Enqueued root job:', data.id);
  }

  // 2. Drive the loop
  console.log('🏎️ Starting driver loop...');
  while (true) {
    try {
      // Run the worker once
      const { stdout, stderr } = await execAsync('node scripts/books/run-book-worker-once.cjs');
      if (stdout.includes('No pending agent jobs')) {
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log('\nWorker output:', stdout);
      }

      if (stderr) console.error('Worker stderr:', stderr);

    } catch (e) {
      console.error('Driver error:', e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main();

