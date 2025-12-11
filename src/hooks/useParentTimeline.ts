import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMCP } from "./useMCP";
import type { ParentTimelineParams, ParentTimelineResponse } from "@/lib/api/parentTimeline";

export interface UseParentTimelineOptions {
  enabled?: boolean;
}

export function useParentTimeline(
  params: ParentTimelineParams = {},
  options: UseParentTimelineOptions = {}
): UseQueryResult<ParentTimelineResponse> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery<ParentTimelineResponse>({
    queryKey: ["parent-timeline", serializedParams],
    queryFn: async () => mcp.getParentTimeline(params.studentId || '', params.limit) as Promise<ParentTimelineResponse>,
    enabled: (options.enabled !== false) && !!params.studentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}


