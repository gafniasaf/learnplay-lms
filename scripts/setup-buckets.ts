import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
}

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

