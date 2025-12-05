import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const planId = process.argv[2];

if (!SUPABASE_URL || !SERVICE_KEY || !planId) {
  console.error("Usage: node scripts/check-plan.js <planId>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const { data, error } = await supabase.functions.invoke("get-record", {
  body: { entity: "PlanBlueprint", id: planId },
});
if (error) {
  console.error(error);
  process.exit(1);
}

const html = data.current_mockup_html || "";
console.log("length", html.length);
["start-sim", "end-case", "new-session", "export-plan"].forEach((cta) => {
  console.log(cta, html.includes(`data-cta-id="${cta}"`));
});
