import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response("Missing Supabase env config", {
      status: 500,
      headers: corsHeaders,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
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
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
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
      `Failed to generate download link: ${error?.message ?? "unknown error"}`,
      { status: 500, headers: corsHeaders },
    );
  }

  return new Response(JSON.stringify({ url: data.signedUrl }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});


