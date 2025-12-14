import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMCP } from './useMCP';
import type { ListAssignmentsResponse } from '@/lib/api/assignments';

export interface UseStudentAssignmentsOptions {
  enabled?: boolean;
}

export function useStudentAssignments(
  options: UseStudentAssignmentsOptions = {}
): UseQueryResult<ListAssignmentsResponse> {
  const mcp = useMCP();

  const queryKey = useMemo(() => ['student-assignments'], []);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<ListAssignmentsResponse> => {
      const result = await mcp.listAssignmentsForStudent();
      return {
        assignments: (result.assignments ?? []) as ListAssignmentsResponse['assignments'],
        scope: result.scope ?? 'student',
      };
    },
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

