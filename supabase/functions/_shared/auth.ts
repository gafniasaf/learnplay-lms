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
        (data.user.user_metadata?.organization_id as string | undefined) ??
        "default"; // Fallback to default org for demo purposes

      return { type: "user", organizationId, userId: data.user.id };
    }
  }

  // Only allow unauthenticated requests in development mode (when ALLOW_ANON is set)
  const allowAnon = Deno.env.get("ALLOW_ANON") === "true";
  if (allowAnon) {
    console.log("[Auth] Anonymous request allowed (ALLOW_ANON=true)");
    // Use the seeded default org UUID
    return { type: "agent", organizationId: "4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58" };
  }

  throw new Error("Unauthorized");
}

export function requireOrganizationId(context: AuthContext, fallback?: string): string {
  const organizationId = context.organizationId ?? fallback;
  if (!organizationId) {
    throw new Error("Missing organization_id");
  }
  return organizationId;
}




