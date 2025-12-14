import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface MediaFile {
  name: string;
  path: string;
  size?: number;
  type?: string;
  created_at?: string;
  public_url?: string;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const bucket = url.searchParams.get("bucket") || "courses";
    const path = url.searchParams.get("path") || "";

    if (action === "list-folders") {
      // List all folders in bucket root
      const { data, error } = await supabase.storage
        .from(bucket)
        .list("", { limit: 100, offset: 0 });

      if (error) throw error;

      const folders = (data || [])
        .filter((item: any) => item.id === null) // Folders have null id
        .map((item: any) => item.name);

      return new Response(
        JSON.stringify({ ok: true, folders }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    if (action === "list") {
      // List files in a specific path
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(path, {
          limit: 100,
          offset: 0,
          sortBy: { column: "created_at", order: "desc" },
        });

      if (error) throw error;

      const files: MediaFile[] = (data || [])
        .filter((item: any) => item.id !== null) // Files have id
        .map((item: any) => {
          const fullPath = path ? `${path}/${item.name}` : item.name;
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(fullPath);

          return {
            name: item.name,
            path: fullPath,
            size: item.metadata?.size,
            type: item.metadata?.mimetype,
            created_at: item.created_at,
            public_url: urlData.publicUrl,
          };
        });

      return new Response(
        JSON.stringify({ ok: true, files }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    if (action === "delete" && req.method === "POST") {
      const body = await req.json();
      const filePath = body.path;

      if (!filePath) {
        return new Response(
          JSON.stringify({ error: "path is required" }),
          { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
        );
      }

      const { error } = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true, message: "File deleted" }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    if (action === "get-url") {
      const filePath = url.searchParams.get("file");
      if (!filePath) {
        return new Response(
          JSON.stringify({ error: "file path is required" }),
          { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
        );
      }

      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      return new Response(
        JSON.stringify({ ok: true, url: data.publicUrl }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    // For uploads, we need a different approach - return signed upload URL
    if (action === "get-upload-url" && req.method === "POST") {
      const body = await req.json();
      const filePath = body.path;
      const contentType = body.contentType || "application/octet-stream";

      if (!filePath) {
        return new Response(
          JSON.stringify({ error: "path is required" }),
          { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
        );
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(filePath);

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true, signedUrl: data.signedUrl, path: data.path }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[manage-media] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


