/**
 * Detect direct fetch calls to Supabase Edge Functions (/functions/v1/).
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct Edge Function fetch calls; use MCP or shared API helpers",
    },
    schema: [],
    messages: {
      noDirectEdge: "Do not call Edge Functions directly. Use MCP or shared API helpers.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "Identifier" || callee.name !== "fetch") return;
        const firstArg = node.arguments?.[0];
        if (firstArg && firstArg.type === "Literal" && typeof firstArg.value === "string") {
          if (firstArg.value.includes("/functions/v1/")) {
            context.report({ node: firstArg, messageId: "noDirectEdge" });
          }
        }
      },
    };
  },
};


