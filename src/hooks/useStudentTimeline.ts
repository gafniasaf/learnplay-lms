import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMockData } from '@/lib/api';
import {
  getStudentTimeline,
  type StudentTimelineParams,
  type StudentTimelineResponse,
} from '@/lib/api/studentTimeline';

export interface UseStudentTimelineOptions {
  enabled?: boolean;
}

export function useStudentTimeline(
  params: StudentTimelineParams = {},
  options: UseStudentTimelineOptions = {}
): UseQueryResult<StudentTimelineResponse> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ['student-timeline', serializedParams],
    queryFn: () => getStudentTimeline(params),
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

