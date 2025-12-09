import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors, newReqId } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(withCors(async (req: Request) => {
  const requestId = newReqId();

  if (req.method !== "GET") {
    return {
      _error: true,
      _status: 405,
      error: { code: "method_not_allowed", message: "Method not allowed" },
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") || url.searchParams.get("id");

  if (!courseId) {
    return {
      _error: true,
      _status: 400,
      error: { code: "bad_request", message: "courseId parameter is required" },
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  console.log(`[get-course] Fetching course: ${courseId}`);

  try {
    // First check if course exists in metadata
    const { data: metadata, error: metaError } = await supabase
      .from("course_metadata")
      .select("*")
      .eq("id", courseId)
      .is("deleted_at", null)
      .single();

    if (metaError && metaError.code !== "PGRST116") {
      console.error(`[get-course] Metadata query error:`, metaError);
      throw metaError;
    }

    // Download course.json from storage
    const path = `${courseId}/course.json`;
    const { data: file, error: downloadErr } = await supabase.storage
      .from("courses")
      .download(path);

    if (downloadErr || !file) {
      console.warn(`[get-course] Course ${courseId} not found in storage:`, downloadErr);
      return {
        _error: true,
        _status: 404,
        error: { code: "not_found", message: "Course not found" },
        requestId,
        timestamp: new Date().toISOString(),
      };
    }

    const text = await file.text();
    if (!text || text.trim() === "") {
      console.warn(`[get-course] Course ${courseId} has empty course.json`);
      return {
        _error: true,
        _status: 404,
        error: { code: "not_found", message: "Course content is empty" },
        requestId,
        timestamp: new Date().toISOString(),
      };
    }

    const courseData = JSON.parse(text);

    // Merge metadata with course data
    const response = {
      id: courseId,
      ...courseData,
      // Override with metadata if available
      title: metadata?.title || courseData.title || courseId,
      subject: metadata?.subject || courseData.subject,
      grade: metadata?.grade_band || courseData.grade,
      visibility: metadata?.visibility,
      organizationId: metadata?.organization_id,
      contentVersion: metadata?.content_version,
      tags: metadata?.tags || {},
      tagIds: metadata?.tag_ids || [],
      createdAt: metadata?.created_at,
      updatedAt: metadata?.updated_at,
      archivedAt: metadata?.archived_at,
    };

    console.log(`[get-course] Successfully fetched course: ${courseId}`);

    return {
      ok: true,
      course: response,
      requestId,
    };
  } catch (error) {
    console.error(`[get-course] Error fetching course ${courseId}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      _error: true,
      _status: 500,
      error: { code: "internal_error", message },
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}));
