import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xlslksprdjsxawvcikfk.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const MOCKUP_BUCKET = process.env.MOCKUP_BUCKET || 'mockups';

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function truncateTables() {
  const tables = ['architect_plans', 'consult_logs'];
  for (const table of tables) {
    const { error } = await client.from(table).delete().gte('created_at', '1970-01-01');
    if (error) {
      throw new Error(`Failed to truncate ${table}: ${error.message}`);
    }
    console.log(`Cleared ${table}`);
  }
}

async function clearMockups() {
  const { data, error } = await client.storage.from(MOCKUP_BUCKET).list('', {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) {
    throw new Error(`Failed to list mockup bucket: ${error.message}`);
  }
  if (!data?.length) {
    console.log('Mockup bucket already empty');
    return;
  }
  const paths = data.map((entry) => entry.name);
  const { error: removeError } = await client.storage.from(MOCKUP_BUCKET).remove(paths);
  if (removeError) {
    throw new Error(`Failed to remove mockup objects: ${removeError.message}`);
  }
  console.log(`Removed ${paths.length} items from mockup bucket`);
}

async function main() {
  await truncateTables();
  await clearMockups();
  console.log('Cleanup completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


