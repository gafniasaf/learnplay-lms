
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const planId = Deno.args[0];
if (!planId) {
  console.error("Please provide plan ID");
  Deno.exit(1);
}

console.log(`Inspecting plan: ${planId}`);

const { data, error } = await supabase.storage
  .from('content')
  .download(`planblueprints/${planId}.json`);

if (error) {
  console.error("Error downloading:", error);
  Deno.exit(1);
}

const text = await data.text();
const json = JSON.parse(text);

console.log("Title:", json.title);
console.log("History Length:", json.chat_history?.length);
console.log("History:", JSON.stringify(json.chat_history, null, 2));

