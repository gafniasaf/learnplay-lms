import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMCP } from './useMCP';
import type { StudentTimelineParams, StudentTimelineResponse } from '@/lib/api/studentTimeline';

export interface UseStudentTimelineOptions {
  enabled?: boolean;
}

export function useStudentTimeline(
  params: StudentTimelineParams = {},
  options: UseStudentTimelineOptions = {}
): UseQueryResult<StudentTimelineResponse> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery<StudentTimelineResponse>({
    queryKey: ['student-timeline', serializedParams],
    queryFn: async () => mcp.getStudentTimeline(params) as Promise<StudentTimelineResponse>,
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

