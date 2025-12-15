import { createClient } from "npm:@supabase/supabase-js@2";

const _SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const _SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!_SUPABASE_URL || !_SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for auth helpers");
}

const SUPABASE_URL: string = _SUPABASE_URL;
const SUPABASE_ANON_KEY: string = _SUPABASE_ANON_KEY;

export type AuthContext = {
  type: "agent" | "user";
  organizationId?: string;
  userId?: string;
};

export async function authenticateRequest(req: Request): Promise<AuthContext> {
  // Agent-token auth (preferred via headers; optional via query params for preview/iframe environments)
  if (AGENT_TOKEN) {
    const agentHeader = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const url = new URL(req.url);
    const agentQuery =
      url.searchParams.get("iz_dev_agent_token") ||
      url.searchParams.get("devAgentToken") ||
      url.searchParams.get("agentToken");
    const agentToken = agentHeader || agentQuery;

    if (agentToken && agentToken === AGENT_TOKEN) {
      const organizationId =
        req.headers.get("x-organization-id") ??
        req.headers.get("X-Organization-Id") ??
        url.searchParams.get("iz_dev_org_id") ??
        url.searchParams.get("devOrgId") ??
        url.searchParams.get("orgId") ??
        undefined;
      // Allow passing user ID for agent token auth (DEV MODE or background workers)
      const userId =
        req.headers.get("x-user-id") ??
        req.headers.get("X-User-Id") ??
        url.searchParams.get("iz_dev_user_id") ??
        url.searchParams.get("devUserId") ??
        url.searchParams.get("userId") ??
        undefined;
      return { type: "agent", organizationId, userId };
    }
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data, error } = await client.auth.getUser();
    
    // If user is authenticated, use their organization
    if (!error && data.user) {
      const organizationId =
        (data.user.app_metadata?.organization_id as string | undefined) ??
        (data.user.user_metadata?.organization_id as string | undefined);

      if (!organizationId) {
        console.error("[Auth] User authenticated but missing organization_id in metadata");
        console.error("[Auth] User ID:", data.user.id);
        console.error("[Auth] User email:", data.user.email);
        console.error("[Auth] app_metadata:", JSON.stringify(data.user.app_metadata));
        console.error("[Auth] user_metadata:", JSON.stringify(data.user.user_metadata));
        throw new Error("User account not configured: missing organization_id. Please contact support or run: npx tsx scripts/fix-admin-org.ts <your-email>");
      }

      return { type: "user", organizationId, userId: data.user.id };
    }
  }

  // No fallbacks - authentication is REQUIRED
  // Per IgniteZero rules: Fail loudly, never mock success
  throw new Error("Unauthorized: Valid Agent Token or User Session required");
}

export function requireOrganizationId(context: AuthContext): string {
  const organizationId = context.organizationId;
  if (organizationId) return organizationId;

  // In agent-token mode, allow falling back to a configured default org id.
  // This keeps non-UI agent calls (smoke tests, cron/worker utilities) from needing to
  // always provide X-Organization-Id, while still enforcing org scoping.
  if (context.type === "agent") {
    const fallback = Deno.env.get("ORGANIZATION_ID");
    if (fallback) return fallback;
  }

  throw new Error("Missing organization_id");
}




