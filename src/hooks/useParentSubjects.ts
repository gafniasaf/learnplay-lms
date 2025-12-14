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
    queryFn: async (): Promise<ParentSubjectsResponse> => {
      const result = await mcp.getParentSubjects(params.studentId || '') as unknown as ParentSubjectsResponse;
      // Ensure all required properties are included
      return {
        ...result,
        studentId: result.studentId ?? params.studentId,
        summary: result.summary ?? null,
        emptyState: result.emptyState ?? ((result.subjects?.length ?? 0) === 0),
      };
    },
    select: options.select,
    enabled: (options.enabled !== false) && !!params.studentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}



