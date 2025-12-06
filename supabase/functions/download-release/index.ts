import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { newReqId } from "../_shared/obs.ts";

serve(async (req) => {
  const reqId = req.headers.get("x-request-id") || newReqId();

  if (req.method === "OPTIONS") {
    return handleOptions(req, reqId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase env config" }),
      {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }),
      }
    );
  }

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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const bucket = Deno.env.get("RELEASE_BUCKET") ?? "releases";
  const objectPath =
    Deno.env.get("RELEASE_OBJECT") ?? "ignite-zero-release.zip";

  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(objectPath, 3600);

  if (error || !data?.signedUrl) {
    return new Response(
      JSON.stringify({ error: `Failed to generate download link: ${error?.message ?? "unknown error"}` }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }) }
    );
  }

  return new Response(JSON.stringify({ url: data.signedUrl }), {
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }),
  });
});
