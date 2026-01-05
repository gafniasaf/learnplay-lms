
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

async function find() {
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title')
    .limit(50);

  if (error) {
    console.error(error);
  } else {
    console.table(books);
  }
}

find();

