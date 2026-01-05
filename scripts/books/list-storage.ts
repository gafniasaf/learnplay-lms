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

async function listStorage() {
  const bookId = 'mbo-aandf-4';
  const versionHash = 'a8fbb3f37355552435bbafb56041703a454c5919ba648ab99a909dc34d03276b';

  // List all buckets first
  console.log('Listing all buckets...');
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error('Buckets error:', bucketsError);
  } else {
    console.log('Buckets:', buckets?.map(b => b.name));
  }

  // Try listing 'books' bucket
  console.log('\nListing books bucket root...');
  const { data: rootList, error: rootError } = await supabase.storage
    .from('books')
    .list('', { limit: 20 });

  if (rootError) {
    console.error('Root list error:', rootError);
  } else {
    console.log('Root items:', rootList?.map(i => i.name));
  }

  // Try listing at book folder
  console.log(`\nListing books/${bookId}...`);
  const { data: bookList, error: bookError } = await supabase.storage
    .from('books')
    .list(bookId, { limit: 20 });

  if (bookError) {
    console.error('Book list error:', bookError);
  } else {
    console.log('Book items:', bookList?.map(i => i.name));
  }

  // Try listing at version folder
  console.log(`\nListing books/${bookId}/${versionHash}...`);
  const { data: versionList, error: versionError } = await supabase.storage
    .from('books')
    .list(`${bookId}/${versionHash}`, { limit: 20 });

  if (versionError) {
    console.error('Version list error:', versionError);
  } else {
    console.log('Version items:', versionList?.map(i => i.name));
  }
}

listStorage();

