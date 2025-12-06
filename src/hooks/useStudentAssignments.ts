import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMockData } from '@/lib/api';
import { listAssignmentsForStudent, type ListAssignmentsResponse } from '@/lib/api/assignments';

export interface UseStudentAssignmentsOptions {
  enabled?: boolean;
}

export function useStudentAssignments(
  options: UseStudentAssignmentsOptions = {}
): UseQueryResult<ListAssignmentsResponse> {
  const mockMode = useMockData();
  const queryEnabled = options.enabled ?? !mockMode;

  const queryKey = useMemo(() => ['student-assignments'], []);

  return useQuery({
    queryKey,
    queryFn: listAssignmentsForStudent,
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

