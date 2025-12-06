import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eidcegehaswbtzrwzvfa.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0NjM1MCwiZXhwIjoyMDgwNDIyMzUwfQ.A6k908P5YTfg6NdKOx0fsDWpROWTDMfFDtWtn3MEti0";

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
