import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import type { ParentGoalsParams, ParentGoalsResponse } from "@/lib/api/parentGoals";

export interface UseParentGoalsOptions {
  enabled?: boolean;
}

export function useParentGoals(
  params: ParentGoalsParams = {},
  options: UseParentGoalsOptions = {}
): UseQueryResult<ParentGoalsResponse> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery<ParentGoalsResponse>({
    queryKey: ["parent-goals", serializedParams],
    queryFn: async () => mcp.getParentGoals(params.studentId || '') as Promise<ParentGoalsResponse>,
    enabled: (options.enabled !== false) && !!params.studentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
