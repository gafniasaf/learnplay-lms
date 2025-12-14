import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eidcegehaswbtzrwzvfa.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0NjM1MCwiZXhwIjoyMDgwNDIyMzUwfQ.A6k908P5YTfg6NdKOx0fsDWpROWTDMfFDtWtn3MEti0";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function setupBuckets() {
  const buckets = ['mockups', 'releases'];
  
  for (const bucket of buckets) {
    console.log(`Creating bucket: ${bucket}...`);
    const { data, error } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: bucket === 'mockups' ? ['text/html', 'image/*'] : ['application/zip', 'application/octet-stream']
    });
    
    if (error) {
      // Check if it already exists
      if (error.message.includes('already exists')) {
         console.log(`Bucket ${bucket} already exists.`);
      } else {
         console.error(`Error creating ${bucket}:`, error);
      }
    } else {
      console.log(`Bucket ${bucket} created successfully.`);
    }
  }
  
  console.log("Bucket setup complete.");
}

setupBuckets();


