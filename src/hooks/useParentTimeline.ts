import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getParentTimeline,
  type ParentTimelineParams,
  type ParentTimelineResponse,
} from "@/lib/api/parentTimeline";
import { useMockData } from "@/lib/api";

export interface UseParentTimelineOptions {
  enabled?: boolean;
}

export function useParentTimeline(
  params: ParentTimelineParams = {},
  options: UseParentTimelineOptions = {}
): UseQueryResult<ParentTimelineResponse> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ["parent-timeline", serializedParams],
    queryFn: () => getParentTimeline(params),
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}


