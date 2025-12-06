import { createClient } from "@supabase/supabase-js";

// Per NO-FALLBACK POLICY: Try alternatives but fail explicitly if none found
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL or VITE_SUPABASE_URL is REQUIRED");
  process.exit(1);
}

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is REQUIRED");
  process.exit(1);
}

const planId = process.argv[2];
if (!planId) {
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
