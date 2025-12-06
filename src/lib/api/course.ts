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
 * Save course content via edge function
 * IgniteZero compliant - no direct storage calls
 */
export async function saveCourseToStorage(
  course: Course
): Promise<{ ok: boolean; path: string }> {
  log.info("Saving course to Storage", {
    action: "saveCourseToStorage",
    courseId: course.id,
  });

  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const url = `${supabaseUrl}/functions/v1/save-course-json`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anonKey}`,
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      courseId: course.id,
      content: course,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    log.error("Save error", new Error(errorText), {
      action: "saveCourseToStorage",
      courseId: course.id,
      status: res.status,
    });
    throw new ApiError(
      `Save failed: ${errorText}`,
      "SAVE_FAILED"
    );
  }

  const result = await res.json();
  
  if (!result.ok) {
    throw new ApiError(result.error || "Save failed", "SAVE_FAILED");
  }

  log.info("Course saved successfully", {
    action: "saveCourseToStorage",
    courseId: course.id,
    path: result.path,
  });
  return { ok: true, path: result.path };
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
