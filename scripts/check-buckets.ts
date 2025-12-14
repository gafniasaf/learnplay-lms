import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkBuckets() {
  console.log("Checking storage buckets...");
  const { data, error } = await supabase.storage.listBuckets();
  
  if (error) {
    console.error("Error listing buckets:", error);
  } else {
    console.log("Buckets found:", data?.map(b => b.name));
  }
}

checkBuckets();

