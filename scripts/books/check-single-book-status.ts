
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

async function checkBookJobs() {
  console.log(`Checking jobs for book: ${BOOK_ID}`);

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('id, title, organization_id')
    .eq('id', BOOK_ID)
    .single();

  if (bookError) {
    console.error('Error fetching book:', bookError);
    return;
  }
  console.log('Book details:', book);

  // Get book version
  const { data: versions, error: versionError } = await supabase
    .from('book_versions')
    .select('id, book_version_id, status, exported_at, authoring_mode, skeleton_schema_version')
    .eq('book_id', BOOK_ID)
    .order('exported_at', { ascending: false });

  if (versionError) {
    console.error('Error fetching versions:', versionError);
  } else {
    console.log('Book versions:', versions);
  }

  // Find all jobs related to this book
  const { data: jobs, error } = await supabase
    .from('ai_agent_jobs')
    .select('*')
    .or(`payload->>bookId.eq.${BOOK_ID},payload->payload->>bookId.eq.${BOOK_ID}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching jobs:', error);
    return;
  }

  console.table(jobs.map(j => ({
    id: j.id,
    type: j.job_type,
    status: j.status,
    error: j.error ? j.error.slice(0, 50) : '',
    created: new Date(j.created_at).toLocaleTimeString()
  })));
}

checkBookJobs();

