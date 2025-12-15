import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import { useAuth } from "./useAuth";
import type { ParentDashboardParams, ParentDashboardResponse } from "@/lib/api/parentDashboard";
import { useSearchParams } from "react-router-dom";
import { isDevAgentMode } from "@/lib/api/common";

export interface UseParentDashboardOptions {
  enabled?: boolean;
}

export function useParentDashboard(
  params: ParentDashboardParams = {},
  options: UseParentDashboardOptions = {}
): UseQueryResult<ParentDashboardResponse> {
  const mcp = useMCP();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  // In dev-agent mode, allow overriding parent identity via URL/storage so preview/seed flows can work
  // even when the authenticated parent has no linked children.
  const devParentIdFromUrl = isDevAgentMode() ? (searchParams.get("parentId") || searchParams.get("devParentId")) : null;
  const devParentIdFromStorage = (() => {
    if (!isDevAgentMode() || typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem("iz_dev_user_id") || window.localStorage.getItem("iz_dev_user_id");
    } catch {
      return null;
    }
  })();

  // Use parentId from params if provided, otherwise:
  // - dev-agent override (url/storage)
  // - authenticated user's ID
  const parentId = params.parentId || devParentIdFromUrl || devParentIdFromStorage || user?.id;
  
  const serializedParams = useMemo(
    () => JSON.stringify({ parentId }),
    [parentId]
  );

  return useQuery<ParentDashboardResponse>({
    queryKey: ["parent-dashboard", serializedParams],
    queryFn: async () => {
      if (!parentId) {
        throw new Error('User not authenticated - parentId required');
      }
      return mcp.getParentDashboard(parentId) as Promise<ParentDashboardResponse>;
    },
    enabled: (options.enabled !== false) && !!parentId, // Don't fetch until we have a parentId
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
