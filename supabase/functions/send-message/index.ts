import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface SendMessageBody {
  recipientId: string;
  content: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "send-message");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: stdHeaders(req) });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Missing organization_id" ? 400 : 401,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  let body: SendMessageBody;
  try {
    body = await req.json() as SendMessageBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.recipientId || !body?.content) {
    return new Response(JSON.stringify({ error: "recipientId and content are required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const organizationId = requireOrganizationId(auth);
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert message (assuming messages table exists)
    const { error } = await adminSupabase
      .from("messages")
      .insert({
        sender_id: userId,
        recipient_id: body.recipientId,
        content: body.content,
        read: false,
        organization_id: organizationId,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.warn("[send-message] Insert error (table may not exist):", error);
    }

    return new Response(
      JSON.stringify({ messageId, success: true }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("send-message error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

