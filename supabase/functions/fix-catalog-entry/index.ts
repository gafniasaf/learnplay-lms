import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonOk, jsonError } from "../_shared/error.ts";
import { withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

Deno.serve(withCors(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method !== "POST") {
    return jsonError("method_not_allowed", "Only POST allowed", 405, requestId, req);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Download existing catalog
    const { data: existingCatalog } = await supabase.storage
      .from("courses")
      .download("catalog.json");

    if (!existingCatalog) {
      return jsonError("not_found", "Catalog not found", 404, requestId, req);
    }

    const catalogText = await existingCatalog.text();
    const catalogData = JSON.parse(catalogText);
    const catalogEntries = catalogData.courses || [];

    // Find and fix the broken entry
    const brokenIndex = catalogEntries.findIndex((c: any) => c.id === "tenses-and-number-grade-2");
    
    if (brokenIndex !== -1) {
      // Update the ID to match the storage path
      catalogEntries[brokenIndex].id = "difference-between-future-past-present-singular-plural";
      
      // Sort by id for consistency
      catalogEntries.sort((a: any, b: any) => a.id.localeCompare(b.id));

      // Upload updated catalog
      const catalogBlob = new Blob([JSON.stringify({ courses: catalogEntries }, null, 2)], {
        type: "application/json",
      });

      const { error: uploadError } = await supabase.storage
        .from("courses")
        .upload("catalog.json", catalogBlob, {
          upsert: true,
          contentType: "application/json",
        });

      if (uploadError) {
        return jsonError("upload_failed", uploadError.message, 500, requestId, req);
      }

      // Update version
      const catalogJson = JSON.stringify({ courses: catalogEntries });
      const etagBytes = await crypto.subtle.digest(
        "SHA-1",
        new TextEncoder().encode(catalogJson)
      );
      const etag = Array.from(new Uint8Array(etagBytes))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const versionBlob = new Blob([etag], { type: "text/plain" });
      await supabase.storage
        .from("courses")
        .upload("catalog.version", versionBlob, {
          upsert: true,
          contentType: "text/plain",
        });

      return jsonOk({ 
        success: true, 
        fixed: true, 
        message: "Catalog entry fixed" 
      }, requestId, req);
    }

    return jsonOk({ 
      success: true, 
      fixed: false, 
      message: "No broken entry found" 
    }, requestId, req);
  } catch (error) {
    return jsonError("internal_error", error instanceof Error ? error.message : String(error), 500, requestId, req);
  }
}));


