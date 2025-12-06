import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
const MOCKUP_BUCKET = Deno.env.get("MOCKUP_BUCKET") ?? "mockups";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface LaneUploadPayload {
  laneId?: string;
  title?: string;
  html?: string;
}

interface BlueprintPayload {
  projectName?: string;
  ownerId?: string;
  sessionId?: string;
  lanes?: LaneUploadPayload[];
}

const encoder = new TextEncoder();

const slugify = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "blueprint-library");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  let body: BlueprintPayload;
  try {
    body = await req.json() as BlueprintPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  const lanes = Array.isArray(body.lanes) ? body.lanes : [];
  if (!lanes.length) {
    return new Response(
      JSON.stringify({ error: "No lanes provided" }),
      {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  const projectSlug = slugify(body.projectName, "ignite-plan");
  const ownerSlug = slugify(body.ownerId, "anon");
  const sessionSlug = slugify(body.sessionId, `${Date.now().toString(36)}`);
  const uploads: { laneId: string; url: string }[] = [];

  for (let index = 0; index < lanes.length; index++) {
    const lane = lanes[index];
    const html = typeof lane?.html === "string" ? lane.html.trim() : "";
    if (!html) {
      continue;
    }

    const laneSlug = slugify(
      lane?.laneId ?? lane?.title ?? `lane-${index + 1}`,
      `lane-${index + 1}`,
    );
    const storagePath = `${ownerSlug}/${projectSlug}/${sessionSlug}/${laneSlug}.html`;

    const { error: uploadError } = await supabase.storage
      .from(MOCKUP_BUCKET)
      .upload(storagePath, encoder.encode(html), {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        },
      );
    }

    const publicUrlData = supabase.storage
      .from(MOCKUP_BUCKET)
      .getPublicUrl(storagePath);

    if (!publicUrlData?.data?.publicUrl) {
      return new Response(
        JSON.stringify({ error: "Failed to generate public URL" }),
        {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        },
      );
    }

    uploads.push({
      laneId: laneSlug,
      url: publicUrlData.data.publicUrl,
    });
  }

  return new Response(
    JSON.stringify({ success: true, mockups: uploads }),
    {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    },
  );
});

