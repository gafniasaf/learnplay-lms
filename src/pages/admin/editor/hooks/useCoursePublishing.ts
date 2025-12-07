import { useMCP } from "@/hooks/useMCP";
import { invalidateCourseCache } from "@/lib/utils/cacheInvalidation";

interface PublishResult {
  version: string | number;
}

export function useCoursePublishing() {
  const mcp = useMCP();

  const validateAndAudit = async (courseId: string, threshold: number) => {
    const vjson = await mcp.call<any>("lms.validateCourseStructure", { courseId });
    if (vjson?.ok === false) {
      const issues = Array.isArray(vjson?.issues) ? vjson.issues.slice(0, 5).join(", ") : "unknown issues";
      throw new Error(`Validation failed: ${issues}`);
    }

    const ajson = await mcp.call<any>("lms.generateVariantsAudit", { courseId });
    if (ajson?.ok === false) {
      throw new Error("Variants audit failed");
    }
    const coverage = Number(ajson?.report?.coverage ?? 1);
    if (coverage < threshold) {
      const pct = Math.round(coverage * 100);
      throw new Error(`Coverage ${pct}% below threshold ${threshold * 100}% — run Auto‑Fix or Generate Missing Variants`);
    }
    return { coverage };
  };

  const publishWithPreflight = async (
    courseId: string,
    changelog: string,
    threshold: number
  ): Promise<PublishResult> => {
    await validateAndAudit(courseId, threshold);
    const result = await mcp.publishCourse(courseId);
    await invalidateCourseCache(courseId);
    return { version: (result as { version?: string | number }).version || '1.0' };
  };

  const archiveCourse = async (courseId: string, reason?: string) => {
    await mcp.call("lms.archiveCourse", { courseId, reason });
    await invalidateCourseCache(courseId);
  };

  const deleteCourse = async (courseId: string, confirmText: string) => {
    await mcp.call("lms.deleteCourse", { courseId, confirm: confirmText });
    await invalidateCourseCache(courseId);
  };

  return {
    publishWithPreflight,
    archiveCourse,
    deleteCourse,
  };
}


