import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eidcegehaswbtzrwzvfa.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0NjM1MCwiZXhwIjoyMDgwNDIyMzUwfQ.A6k908P5YTfg6NdKOx0fsDWpROWTDMfFDtWtn3MEti0";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkJobs() {
  console.log("Checking ai_course_jobs structure and data...");

  // 1. Check one row to see columns
  const { data: jobs, error } = await supabase
    .from("ai_course_jobs")
    .select("*, updated_at") // Explicitly ask for it
    .limit(1);

  if (error) {
    console.error("Error fetching jobs:", error);
  } else {
    console.log("Found jobs:", jobs?.length);
    if (jobs && jobs.length > 0) {
      console.log("Sample job keys:", Object.keys(jobs[0]));
    }
  }

  // 2. Try to create a dummy job directly
  const { data: newJob, error: createError } = await supabase
    .from("ai_course_jobs")
    .insert({
      course_id: "debug-test",
      subject: "smoke-test",
      grade_band: "K-2",
      grade: "1",
      mode: "options",
      status: "failed"
    })
    .select()
    .single();
    
  if (createError) {
    console.error("Error creating test job:", createError);
    return;
  }
  
  console.log("Created test job:", newJob.id);

  // 3. Try to update it (simulate requeue)
  const { data: updated, error: updateError } = await supabase
    .from("ai_course_jobs")
    .update({
        status: "pending",
        retry_count: 0,
        error: null
      })
      .eq("id", newJob.id)
      .select()
      .single();

  if (updateError) {
    console.error("Error updating test job:", updateError);
  } else {
    console.log("Successfully updated job:", updated.status);
  }
}

checkJobs();

