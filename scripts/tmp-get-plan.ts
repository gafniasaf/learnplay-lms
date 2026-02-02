import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../supabase/.deploy.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.learnplay.generated") });

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const jobId = "2cb1943a-1001-45d3-b179-1cf21b6a7456";
  
  const { data: job } = await sb.from("ai_agent_jobs")
    .select("result")
    .eq("id", jobId)
    .single();
  
  if (!job?.result) {
    console.log("No result found");
    return;
  }
  
  const result = job.result as any;
  
  // Save full result to file
  fs.writeFileSync(
    path.resolve(__dirname, "../.tmp/multi-week-plan.json"),
    JSON.stringify(result, null, 2)
  );
  
  console.log("Full plan saved to .tmp/multi-week-plan.json\n");
  
  // Print summary
  const plan = result.multiWeekPlan;
  if (plan) {
    console.log("=== MULTI-WEEK LESSON PLAN ===\n");
    console.log(`Title: ${plan.title}`);
    console.log(`Total Weeks: ${plan.weeks?.length}`);
    console.log(`Grade Band: ${plan.gradeBand}`);
    console.log("");
    
    for (const week of plan.weeks || []) {
      console.log(`\n--- Week ${week.weekNumber}: ${week.theme} ---`);
      console.log(`Focus: ${week.focus}`);
      console.log(`Learning Goals: ${week.learningGoals?.join(", ")}`);
      
      for (const lesson of week.lessons || []) {
        console.log(`\n  Lesson ${lesson.lessonNumber}: ${lesson.title}`);
        console.log(`    Duration: ${lesson.duration} min`);
        console.log(`    Objectives: ${lesson.objectives?.slice(0, 2).join("; ")}...`);
      }
    }
  }
}

main();
