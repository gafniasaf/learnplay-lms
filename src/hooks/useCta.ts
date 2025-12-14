import { CtaId, CtaIdType } from "@/lib/cta-ids";

type CtaAction = "navigate" | "save" | "click" | "enqueueJob" | "ui" | "external";

interface UseCtaOptions {
  action?: CtaAction;
  target?: string;
  jobType?: string;
  entity?: string;
}

/**
 * Hook to generate type-safe CTA attributes
 * 
 * @example
 * ```tsx
 * <Button {...useCta(CtaId.NAV_KIDS, { action: "navigate", target: "/kids" })}>
 *   Kids Portal
 * </Button>
 * ```
 */
export function useCta(
  id: CtaIdType,
  options: UseCtaOptions = {}
): {
  "data-cta-id": string;
  "data-action": string;
  "data-target"?: string;
  "data-job-type"?: string;
  "data-entity"?: string;
} {
  const { action = "click", target, jobType, entity } = options;
  
  const attrs: {
    "data-cta-id": string;
    "data-action": string;
    "data-target"?: string;
    "data-job-type"?: string;
    "data-entity"?: string;
  } = {
    "data-cta-id": id,
    "data-action": action,
  };
  
  if (target) {
    attrs["data-target"] = target;
  }
  
  if (jobType) {
    attrs["data-job-type"] = jobType;
  }
  
  if (entity) {
    attrs["data-entity"] = entity;
  }
  
  return attrs;
}

/**
 * Convenience hook for navigation CTAs
 */
export function useCtaNavigate(id: CtaIdType, target: string) {
  return useCta(id, { action: "navigate", target });
}

/**
 * Convenience hook for save CTAs
 */
export function useCtaSave(id: CtaIdType, entity: string) {
  return useCta(id, { action: "save", entity });
}

/**
 * Convenience hook for job enqueue CTAs
 */
export function useCtaJob(id: CtaIdType, jobType: string) {
  return useCta(id, { action: "enqueueJob", jobType });
}


