import fetch from 'node-fetch';

/**
 * This script requires a target Supabase project URL and a service role token.
 * Pass them explicitly via environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

async function runSql() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const sql = `
    ALTER TABLE public.ai_course_jobs 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

    ALTER TABLE public.ai_media_jobs 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

    DROP TRIGGER IF EXISTS handle_updated_at ON public.ai_course_jobs;
    DROP TRIGGER IF EXISTS set_updated_at ON public.ai_course_jobs;
    DROP TRIGGER IF EXISTS handle_updated_at ON public.ai_media_jobs;
  `;

  console.log("Executing SQL via exec-sql function...");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/exec-sql`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ sql })
  });

  const text = await response.text();
  console.log("Response:", text);
}

runSql();

