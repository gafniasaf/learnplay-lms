import noDirectSupabaseUi from "./lib/rules/no-direct-supabase-ui.js";
import noDirectEdgeCalls from "./lib/rules/no-direct-edge-calls.js";

export const rules = {
  "no-direct-supabase-ui": noDirectSupabaseUi,
  "no-direct-edge-calls": noDirectEdgeCalls,
};

export default { rules };


