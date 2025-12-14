import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function reloadSchema() {
  console.log("Calling reload_schema RPC...");
  const { error } = await supabase.rpc('reload_schema');
  
  if (error) {
    console.error("Error reloading schema:", error);
  } else {
    console.log("Schema reload requested.");
  }
}

reloadSchema();
