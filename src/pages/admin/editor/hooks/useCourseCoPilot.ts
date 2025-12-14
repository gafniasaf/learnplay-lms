import { useMCP } from "@/hooks/useMCP";

export function useCourseCoPilot() {
  const mcp = useMCP();

  const startVariants = async (courseId: string, subject: string) => {
    const json = await mcp.call<any>("lms.editorCoPilot", {
      action: "variants",
      subject,
      format: "practice",
      courseId,
    });
    if (json?.jobId) return json.jobId as string;
    throw new Error(json?.error?.message || "Co‑Pilot failed to start");
  };

  const startEnrich = async (courseId: string, subject: string) => {
    const json = await mcp.call<any>("lms.editorCoPilot", {
      action: "enrich",
      subject,
      format: "explainer",
      courseId,
    });
    if (json?.jobId) return json.jobId as string;
    throw new Error(json?.error?.message || "Co‑Pilot failed to start");
  };

  const startLocalize = async (courseId: string, subject: string, locale: string) => {
    const json = await mcp.call<any>("lms.editorCoPilot", {
      action: "localize",
      subject,
      format: "explainer",
      courseId,
      locale,
    });
    if (json?.jobId) return json.jobId as string;
    throw new Error(json?.error?.message || "Co‑Pilot failed to start");
  };

  return {
    startVariants,
    startEnrich,
    startLocalize,
  };
}



