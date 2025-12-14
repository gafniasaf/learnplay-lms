import { useMCP } from "@/hooks/useMCP";

export interface VariantsAuditResult {
  diff: Array<{ op: string; path: string; value?: unknown }>;
  report?: any;
}

export function useCourseVariants() {
  const mcp = useMCP();

  const repairPreview = async (courseId: string) => {
    const json = await mcp.call<any>("lms.editorRepairCourse", { courseId, apply: false });
    if (!json?.ok) throw new Error(json?.error || "Repair failed");
    return json?.preview?.diff || [];
  };

  const variantsAudit = async (courseId: string): Promise<VariantsAuditResult> => {
    const json = await mcp.call<any>("lms.editorVariantsAudit", { courseId, apply: false });
    if (!json?.ok) throw new Error(json?.error || "Variants audit failed");
    const diff = json?.preview?.diff || (json?.mergePlan?.patch || []);
    return { diff: Array.isArray(diff) ? diff : [], report: json?.report || null };
  };

  const variantsMissing = async (courseId: string): Promise<Array<{ op: string; path: string; value?: unknown }>> => {
    const json = await mcp.call<any>("lms.editorVariantsMissing", { courseId, apply: false });
    if (!json?.ok) throw new Error(json?.error || "Generate missing variants failed");
    const diff = json?.preview?.diff || (json?.mergePlan?.patch || []);
    return Array.isArray(diff) ? diff : [];
  };

  const autoFix = async (courseId: string) => {
    try {
      const json = await mcp.call<any>("lms.editorAutoFix", { courseId, apply: true });
      if (!json?.ok) throw new Error(json?.error || "Apply failed");
      return json;
    } catch (e: any) {
      if (e.status === 403 || (e.message || "").includes("403")) {
        throw new Error("403");
      }
      throw e;
    }
  };

  return {
    repairPreview,
    variantsAudit,
    variantsMissing,
    autoFix,
  };
}



