
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

const BOOK_ID = 'mbo-aandf-4';
const ORG_ID = '4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58';
const BOOK_VERSION_ID = 'ee0b3b54-c25d-41be-a6f7-61b52fb0cd7f'; // Most recent version
const CHAPTER_INDEX = parseInt(process.argv[2] || '0', 10); // Chapter index from CLI or default 0

async function trigger() {
  console.log(`🚀 Triggering Chapter ${CHAPTER_INDEX} for ${BOOK_ID}`);

  // Fetch version to get canonical path
  console.log('Fetching book version...');
  const { data: version, error: versionError } = await supabase
    .from('book_versions')
    .select('canonical_path')
    .eq('id', BOOK_VERSION_ID)
    .single();

  if (versionError || !version?.canonical_path) {
    console.error('Failed to fetch version:', versionError);
    process.exit(1);
  }

  // Fetch canonical to get chapter count and title
  console.log('Fetching canonical from:', version.canonical_path);
  const { data: skData, error: skError } = await supabase.storage
    .from('books')
    .download(version.canonical_path);

  if (skError || !skData) {
    console.error('Failed to fetch canonical:', skError);
    process.exit(1);
  }

  const skText = await skData.text();
  const canonical = JSON.parse(skText);
  const chapterCount = canonical.chapters?.length || 0;
  const chapterTitle = canonical.chapters?.[CHAPTER_INDEX]?.title || `Chapter ${CHAPTER_INDEX + 1}`;

  console.log(`Found ${chapterCount} chapters. Triggering: "${chapterTitle}"`);

  const payload = {
    bookId: BOOK_ID,
    bookVersionId: BOOK_VERSION_ID,
    chapterIndex: CHAPTER_INDEX,
    chapterCount: chapterCount,
    topic: `MBO A&F 4 - ${chapterTitle}`
  };

  const { data, error } = await supabase
    .from('ai_agent_jobs')
    .insert({
      job_type: 'book_generate_chapter',
      status: 'queued',
      organization_id: ORG_ID,
      payload: payload
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to enqueue job:', error);
  } else {
    console.log('✅ Job enqueued:', data.id);
    console.log('You can now monitor this job in the app or via scripts.');
  }
}

trigger();

