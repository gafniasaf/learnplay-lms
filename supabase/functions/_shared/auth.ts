import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for auth helpers");
}

export type AuthContext = {
  type: "agent" | "user";
  organizationId?: string;
  userId?: string;
};

export async function authenticateRequest(req: Request): Promise<AuthContext> {
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
    if (error || !data.user) {
      throw new Error("Unauthorized");
    }

    const organizationId =
      (data.user.app_metadata?.organization_id as string | undefined) ??
      (data.user.user_metadata?.organization_id as string | undefined);

    if (!organizationId) {
      throw new Error("Missing organization context");
    }

    return { type: "user", organizationId, userId: data.user.id };
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




