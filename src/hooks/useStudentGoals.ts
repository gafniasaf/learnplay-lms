import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMCP } from './useMCP';
import type { StudentGoalQueryParams, StudentGoalsResponse } from '@/lib/api/studentGoals';

export interface UseStudentGoalsOptions {
  enabled?: boolean;
}

export function useStudentGoals(
  params: StudentGoalQueryParams = {},
  options: UseStudentGoalsOptions = {}
): UseQueryResult<StudentGoalsResponse> {
  const mcp = useMCP();
  const serializedParams = useMemo(
    () => JSON.stringify(params ?? {}),
    [params]
  );

  return useQuery<StudentGoalsResponse>({
    queryKey: ['student-goals', serializedParams],
    queryFn: async () => {
      const result = await mcp.getStudentGoals(params);
      return result as StudentGoalsResponse;
    },
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
