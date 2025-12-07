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

  return useQuery({
    queryKey: ["parent-dashboard", serializedParams],
    queryFn: () => mcp.getParentDashboard(params.parentId),
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
