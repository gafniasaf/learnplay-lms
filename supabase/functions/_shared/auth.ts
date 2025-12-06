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
  // Check for agent token first
  const agentHeader = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
  if (AGENT_TOKEN && agentHeader === AGENT_TOKEN) {
    const organizationId = req.headers.get("x-organization-id") ?? req.headers.get("X-Organization-Id") ?? undefined;
    return { type: "agent", organizationId };
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
        throw new Error("User account not configured: missing organization_id");
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
  if (!organizationId) {
    throw new Error("Missing organization_id");
  }
  return organizationId;
}




