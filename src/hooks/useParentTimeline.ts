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
    queryFn: async (): Promise<ParentTimelineResponse> => {
      const result = await mcp.getParentTimeline(params.studentId || '', params.limit) as { events?: unknown[]; nextCursor?: string | null; hasMore?: boolean };
      return {
        events: (result.events ?? []) as ParentTimelineResponse['events'],
        nextCursor: result.nextCursor ?? null,
        hasMore: result.hasMore ?? (result.nextCursor !== null),
      };
    },
    enabled: (options.enabled !== false) && !!params.studentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}


