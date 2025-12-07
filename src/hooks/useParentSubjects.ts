import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import type { ParentSubjectsParams, ParentSubjectsResponse } from "@/lib/api/parentSubjects";

export interface UseParentSubjectsOptions<TData = ParentSubjectsResponse> {
  enabled?: boolean;
  select?: (data: ParentSubjectsResponse) => TData;
}

export function useParentSubjects<TData = ParentSubjectsResponse>(
  params: ParentSubjectsParams = {},
  options: UseParentSubjectsOptions<TData> = {}
): UseQueryResult<TData> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery({
    queryKey: ["parent-subjects", serializedParams],
    queryFn: () => mcp.getParentSubjects(params.childId || ''),
    select: options.select,
    enabled: (options.enabled !== false) && !!params.childId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}



