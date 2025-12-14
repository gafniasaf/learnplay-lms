import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkTriggers() {
  console.log("Listing triggers via RPC...");
  const { data, error } = await supabase.rpc('list_triggers_debug');
  
  if (error) {
    console.error("Error listing triggers:", error);
  } else {
    console.log("Triggers found:", data);
  }
}

checkTriggers();

