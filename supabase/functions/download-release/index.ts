import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { stdHeaders, handleOptions, newReqId } from "../_shared/cors.ts";

serve(async (req) => {
  const reqId = req.headers.get("x-request-id") || newReqId();

  if (req.method === "OPTIONS") {
    return handleOptions(req, reqId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = Deno.env.get("RELEASE_BUCKET");
  const objectPath = Deno.env.get("RELEASE_OBJECT");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !bucket || !objectPath) {
    return new Response(
      JSON.stringify({
        error:
          "Missing Supabase env config (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RELEASE_BUCKET, RELEASE_OBJECT)",
      }),
      {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }),
      }
    );
  }

  // Check for agent token first (backend/automation calls)
  const agentToken = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
  const expectedAgentToken = Deno.env.get("AGENT_TOKEN");
  const isAgentAuth = expectedAgentToken && agentToken === expectedAgentToken;

  if (!isAgentAuth) {
    // User auth - require Authorization header with valid JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
      );
    }
  }
  // Agent auth passes through - they have permission to download

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Check if bucket exists first
  const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets();
  if (bucketsError) {
    return new Response(
      JSON.stringify({ error: `Storage error: ${bucketsError.message}` }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
    );
  }
  
  const bucketExists = buckets?.some(b => b.name === bucket);
  if (!bucketExists) {
    return new Response(
      JSON.stringify({ 
        error: `Release bucket '${bucket}' not configured`, 
        hint: `Create storage bucket '${bucket}' in Supabase Dashboard`
      }),
      { status: 404, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
    );
  }

  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(objectPath, 3600);

  if (error || !data?.signedUrl) {
    // Check if it's a "not found" error for the object
    if (error?.message?.includes('not found') || error?.message?.includes('Object not found')) {
      return new Response(
        JSON.stringify({ 
          error: `Release file '${objectPath}' not found in bucket '${bucket}'`,
          hint: 'Upload the release file to the storage bucket'
        }),
        { status: 404, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
      );
    }
    return new Response(
      JSON.stringify({ error: `Failed to generate download link: ${error?.message ?? "unknown error"}` }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
    );
  }

  return new Response(JSON.stringify({ url: data.signedUrl }), {
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }),
  });
});
