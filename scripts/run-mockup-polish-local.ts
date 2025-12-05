import "jsr:@std/dotenv/load";
import { runJob } from "../supabase/functions/ai-job-runner/runner.ts";

const planId = Deno.args[0];
const request = Deno.args.slice(1).join(" ") || "Generate the polished mockup.";
const muteLogs = Deno.env.get("MUTE_POLISH_LOGS") === "true";
const originalLog = console.log;
if (muteLogs) {
  console.log = () => {};
}

if (!planId) {
  console.error("Usage: deno run run-mockup-polish-local.ts <planId> [request]");
  Deno.exit(1);
}

if (!muteLogs) {
  console.log(`Running mockup_polish locally for plan ${planId}`);
}
const result = await runJob("mockup_polish", {
  planBlueprintId: planId,
  ai_request: request,
});

if (muteLogs) {
  console.log = originalLog;
}
console.log(JSON.stringify(result));

