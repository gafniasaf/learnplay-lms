import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getParentSubjects,
  type ParentSubjectsParams,
  type ParentSubjectsResponse,
} from "@/lib/api/parentSubjects";
import { useMockData } from "@/lib/api";

export interface UseParentSubjectsOptions<TData = ParentSubjectsResponse> {
  enabled?: boolean;
  select?: (data: ParentSubjectsResponse) => TData;
}

export function useParentSubjects<TData = ParentSubjectsResponse>(
  params: ParentSubjectsParams = {},
  options: UseParentSubjectsOptions<TData> = {}
): UseQueryResult<TData> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ["parent-subjects", serializedParams],
    queryFn: () => getParentSubjects(params),
    select: options.select,
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}



