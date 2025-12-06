import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return handleOptions(req, crypto.randomUUID());
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const url = new URL(req.url);
    const childId = url.searchParams.get("childId") || undefined;
    if (!childId) {
      return new Response(JSON.stringify({ error: "childId is required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data, error } = await supabase
      .from("student_activity_log")
      .select("id, event_type, description, metadata, occurred_at, created_at")
      .eq("student_id", childId)
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const events = (data || []).map((e: any) => ({
      id: e.id,
      eventType: e.event_type,
      description: e.description,
      metadata: e.metadata,
      occurredAt: e.occurred_at,
      createdAt: e.created_at,
    }));

    return new Response(JSON.stringify({ childId, events }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parent-timeline] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
