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

  return useQuery({
    queryKey: ['student-goals', serializedParams],
    queryFn: async (): Promise<StudentGoalsResponse> => {
      const result = await mcp.getStudentGoals(params);
      return {
        goals: (result.goals ?? []) as StudentGoalsResponse['goals'],
        summary: result.summary ?? { total: 0, onTrack: 0, behind: 0, completed: 0 },
      };
    },
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

