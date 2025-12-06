import { isLiveMode } from "../env";
import type { Course } from "../types/course";
import { shouldUseMockData, fetchWithTimeout, ApiError, getSupabaseUrl, getSupabaseAnonKey } from "./common";
import { createLogger } from "../logger";

// Conditional import for mocks (tree-shaken in production)
const getMocks = () => import("../mocks");

const log = createLogger("api/course");

/**
 * API: Get course data via Edge Function
 */
export async function getCourse(
  courseId: string
): Promise<
  Course & { _metadata?: { dataSource: "live" | "mock"; etag?: string } }
> {
  const liveMode = isLiveMode();

  if (shouldUseMockData()) {
    if (liveMode) {
      log.warn("Mock data used in LIVE mode - this should not happen!", {
        action: "getCourse",
        courseId,
      });
    }
    const { fetchCourse } = await getMocks();
    const mockCourse = await fetchCourse(courseId);
    return { ...mockCourse, _metadata: { dataSource: "mock" } };
  }

  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const url = `${supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anonKey}`,
  };

  log.info("Fetching course", { courseId });
  
  const res = await fetchWithTimeout(url, { method: "GET", headers });
  if (!res.ok) {
    const errorText = await res.text();
    log.error("Course fetch failed", new Error(errorText), {
      action: "getCourse",
      courseId,
      status: res.status,
    });
    throw new ApiError(`Failed to fetch course: ${errorText}`, "FETCH_FAILED", res.status);
  }

  const json = await res.json();
  const etag = res.headers?.get?.("ETag") || undefined;
  const { course: normalizedCourse, format, envelope } = unwrapCoursePayload(json);
  return {
    ...(normalizedCourse as Course),
    _metadata: {
      dataSource: "live",
      etag,
      format,
      envelope,
    },
  } as Course & { _metadata?: { dataSource: "live" | "mock"; etag?: string; format?: string; envelope?: unknown } };
}

/**
 * Upload course content to Storage via Edge Function
 * Requires authenticated admin user
 */
// Legacy authorCourse API has been removed in favor of the new agent pipeline.

/**
 * Save course content directly to Supabase Storage
 * Requires authenticated admin user
 */
export async function saveCourseToStorage(
  course: Course
): Promise<{ ok: boolean; path: string }> {
  log.info("Saving course to Storage", {
    action: "saveCourseToStorage",
    courseId: course.id,
  });

  const { supabase } = await import("@/integrations/supabase/client");

  // Update contentVersion to current timestamp
  const updatedCourse = {
    ...course,
    contentVersion: new Date().toISOString(),
  };

  const path = `${course.id}/course.json`;
  const metaAny = course as any;
  const envelope = {
    courseId: updatedCourse.id,
    format: metaAny?._metadata?.format ?? "practice",
    version: metaAny?._metadata?.envelope?.version ?? "1.0.0",
    content: updatedCourse,
  };
  const courseJson = JSON.stringify(envelope, null, 2);
  const blob = new Blob([courseJson], { type: "application/json" });

  const { error: uploadError } = await supabase.storage
    .from("courses")
    .upload(path, blob, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });

  if (uploadError) {
    log.error(
      "Save error",
      uploadError instanceof Error
        ? uploadError
        : new Error(uploadError?.message || "Upload failed"),
      {
        action: "saveCourseToStorage",
        courseId: course.id,
      }
    );
    throw new ApiError(
      uploadError.message || "Save failed",
      "SAVE_FAILED"
    );
  }

  log.info("Course saved successfully", {
    action: "saveCourseToStorage",
    courseId: course.id,
    path,
  });
  return { ok: true, path };
}

function unwrapCoursePayload(payload: any): { course: any; format: string; envelope?: any } {
  if (payload && typeof payload === "object" && "content" in payload && "format" in payload) {
    return {
      course: payload.content,
      format: String(payload.format ?? "practice"),
      envelope: payload,
    };
  }

  return {
    course: payload,
    format: "practice",
    envelope: undefined,
  };
}
