import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getParentGoals,
  type ParentGoalsParams,
  type ParentGoalsResponse,
} from "@/lib/api/parentGoals";
import { useMockData } from "@/lib/api";

export interface UseParentGoalsOptions {
  enabled?: boolean;
}

export function useParentGoals(
  params: ParentGoalsParams = {},
  options: UseParentGoalsOptions = {}
): UseQueryResult<ParentGoalsResponse> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ["parent-goals", serializedParams],
    queryFn: () => getParentGoals(params),
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
