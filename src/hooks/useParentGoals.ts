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

  return useQuery({
    queryKey: ["parent-goals", serializedParams],
    queryFn: async (): Promise<ParentGoalsResponse> => {
      const result = await mcp.getParentGoals(params.studentId || '') as { goals?: unknown[]; summary?: unknown; emptyState?: boolean };
      return {
        goals: (result.goals ?? []) as ParentGoalsResponse['goals'],
        summary: (result.summary ?? null) as ParentGoalsResponse['summary'],
        emptyState: result.emptyState ?? ((result.goals?.length ?? 0) === 0),
      };
    },
    enabled: (options.enabled !== false) && !!params.studentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
