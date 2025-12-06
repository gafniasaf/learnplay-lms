import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getParentDashboard,
  type ParentDashboardParams,
  type ParentDashboardResponse,
} from "@/lib/api/parentDashboard";
import { useMockData } from "@/lib/api";

export interface UseParentDashboardOptions {
  enabled?: boolean;
}

export function useParentDashboard(
  params: ParentDashboardParams = {},
  options: UseParentDashboardOptions = {}
): UseQueryResult<ParentDashboardResponse> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ["parent-dashboard", serializedParams],
    queryFn: () => getParentDashboard(params),
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
