import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMockData } from '@/lib/api';
import {
  getStudentGoals,
  type StudentGoalQueryParams,
  type StudentGoalsResponse,
} from '@/lib/api/studentGoals';

export interface UseStudentGoalsOptions {
  enabled?: boolean;
}

export function useStudentGoals(
  params: StudentGoalQueryParams = {},
  options: UseStudentGoalsOptions = {}
): UseQueryResult<StudentGoalsResponse> {
  const mockMode = useMockData();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ['student-goals', serializedParams],
    queryFn: () => getStudentGoals(params),
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

