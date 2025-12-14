import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eidcegehaswbtzrwzvfa.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0NjM1MCwiZXhwIjoyMDgwNDIyMzUwfQ.A6k908P5YTfg6NdKOx0fsDWpROWTDMfFDtWtn3MEti0";

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


