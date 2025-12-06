import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface AdoptMediaRequest {
  assetId: string;
  tempPath: string;
  canonicalPath: string;
  bucket: string;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  try {
    const body = await req.json() as AdoptMediaRequest;
    const { assetId, tempPath, canonicalPath, bucket } = body;

    if (!tempPath || !canonicalPath || !bucket) {
      return new Response(
        JSON.stringify({ error: "tempPath, canonicalPath, and bucket are required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    // Move file in storage from temp → canonical
    const { error: moveError } = await supabase.storage
      .from(bucket)
      .move(tempPath, canonicalPath);

    if (moveError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to move media: ${moveError.message}` 
        }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    // Update media_assets table with new path if assetId provided
    if (assetId) {
      const { error: updateError } = await supabase
        .from('media_assets')
        .update({ storage_path: canonicalPath })
        .eq('id', assetId);

      if (updateError) {
        console.warn('[adopt-media] Failed to update media_assets table:', updateError);
        // Non-fatal - file is moved, just metadata update failed
      }
    }

    // Construct public URL for the canonical path
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${canonicalPath}`;

    return new Response(
      JSON.stringify({ 
        success: true, 
        canonicalUrl: publicUrl 
      }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[adopt-media] Error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

