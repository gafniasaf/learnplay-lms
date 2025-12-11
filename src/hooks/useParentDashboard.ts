import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import { useAuth } from "./useAuth";
import type { ParentDashboardParams, ParentDashboardResponse } from "@/lib/api/parentDashboard";

export interface UseParentDashboardOptions {
  enabled?: boolean;
}

export function useParentDashboard(
  params: ParentDashboardParams = {},
  options: UseParentDashboardOptions = {}
): UseQueryResult<ParentDashboardResponse> {
  const mcp = useMCP();
  const { user } = useAuth();
  
  // Use parentId from params if provided, otherwise use authenticated user's ID
  const parentId = params.parentId || user?.id;
  
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
