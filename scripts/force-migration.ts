import { Client } from 'pg';

const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ BLOCKED: SUPABASE_DB_URL (or DATABASE_URL) is required to run this migration script.');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    // 1. Add column
    console.log("Adding updated_at column...");
    await client.query(`
      ALTER TABLE public.ai_course_jobs 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    `);
    
    // 2. Drop triggers
    console.log("Dropping triggers...");
    await client.query(`
      DROP TRIGGER IF EXISTS handle_updated_at ON public.ai_course_jobs;
      DROP TRIGGER IF EXISTS set_updated_at ON public.ai_course_jobs;
    `);

    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

runMigration();

