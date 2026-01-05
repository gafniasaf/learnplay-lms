import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function monitor() {
  console.log("🔍 Checking active BookGen jobs...");
  
  const { data: jobs, error } = await supabase
    .from("ai_agent_jobs")
    .select("id, job_type, status, created_at, payload, error")
    .in("job_type", ["book_generate_chapter", "book_generate_section"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching jobs:", error);
    return;
  }

  console.table(jobs.map(j => ({
    id: j.id, // Full ID
    type: j.job_type,
    status: j.status,
    topic: j.payload?.topic || j.payload?.payload?.topic || "N/A",
    created: new Date(j.created_at).toLocaleTimeString(),
    error: j.error ? j.error.slice(0, 50) : ""
  })));
}

monitor().catch(console.error);

