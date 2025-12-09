import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import type { ParentDashboardParams, ParentDashboardResponse } from "@/lib/api/parentDashboard";

export interface UseParentDashboardOptions {
  enabled?: boolean;
}

export function useParentDashboard(
  params: ParentDashboardParams = {},
  options: UseParentDashboardOptions = {}
): UseQueryResult<ParentDashboardResponse> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery<ParentDashboardResponse>({
    queryKey: ["parent-dashboard", serializedParams],
    queryFn: async () => {
      const result = await mcp.getParentDashboard(params.parentId);
      return result as ParentDashboardResponse;
    },
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
