import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getParentTopics,
  type ParentTopicsParams,
  type ParentTopicsResponse,
} from "@/lib/api/parentTopics";
import { useMockData } from "@/lib/api";

export interface UseParentTopicsOptions {
  enabled?: boolean;
}

export function useParentTopics(
  params: ParentTopicsParams | null,
  options: UseParentTopicsOptions = {}
): UseQueryResult<ParentTopicsResponse> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = (options.enabled ?? !mockMode) && Boolean(params?.studentId);

  return useQuery({
    queryKey: ["parent-topics", serializedParams],
    queryFn: () => getParentTopics(params as ParentTopicsParams),
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
