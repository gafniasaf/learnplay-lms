/**
 * Detect direct supabase client usage (`supabase.from` / `supabase.functions.invoke`) in UI files.
 * Enforce routing through hooks or MCP.
 * 
 * Exception: `supabase.auth` is allowed everywhere - auth operations are infrastructure-level
 * and cannot be routed through MCP (auth is required to authenticate MCP calls).
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct supabase client access in UI components",
    },
    schema: [],
    messages: {
      noDirectSupabase: "UI should not access Supabase directly. Use hooks or MCP.",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const objectName = node.object?.name;
        const propName = node.property?.name;
        
        // Block supabase.from everywhere (should use MCP/getRecord/listRecords)
        if (objectName === "supabase" && propName === "from") {
          context.report({
            node,
            messageId: "noDirectSupabase",
          });
          return;
        }
        
        // Block supabase.functions.invoke everywhere (should use MCP/callEdgeFunction)
        if (objectName === "supabase" && 
            node.object?.type === "MemberExpression" &&
            node.object.property?.name === "functions" &&
            propName === "invoke") {
          context.report({
            node,
            messageId: "noDirectSupabase",
          });
          return;
        }
        
        // Allow supabase.auth everywhere - auth is infrastructure and can't go through MCP
        // (auth is required to authenticate MCP calls)
      },
    };
  },
};


