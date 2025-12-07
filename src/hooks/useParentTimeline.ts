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

  return useQuery({
    queryKey: ["parent-timeline", serializedParams],
    queryFn: () => mcp.getParentTimeline(params.childId || '', params.limit),
    enabled: (options.enabled !== false) && !!params.childId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}


