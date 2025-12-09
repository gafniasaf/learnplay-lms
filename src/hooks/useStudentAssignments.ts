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

  return useQuery<ListAssignmentsResponse>({
    queryKey,
    queryFn: async () => {
      const result = await mcp.listAssignmentsForStudent();
      return result as ListAssignmentsResponse;
    },
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
