import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import type { ParentTopicsParams, ParentTopicsResponse } from "@/lib/api/parentTopics";

export interface UseParentTopicsOptions {
  enabled?: boolean;
}

export function useParentTopics(
  params: ParentTopicsParams | null,
  options: UseParentTopicsOptions = {}
): UseQueryResult<ParentTopicsResponse> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery<ParentTopicsResponse>({
    queryKey: ["parent-topics", serializedParams],
    queryFn: async () => mcp.getParentTopics(params?.studentId || '') as Promise<ParentTopicsResponse>,
    enabled: (options.enabled !== false) && Boolean(params?.studentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
