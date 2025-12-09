import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMCP } from './useMCP';
import type { Assignment, ListAssignmentsResponse } from '@/lib/api/assignments';
import type { Class, Student } from '@/lib/api/classes';

export interface TeacherDashboardData {
  assignments: Assignment[];
  classes: Class[];
  students: Student[];
}

export interface UseTeacherDashboardOptions {
  enabled?: boolean;
}

export function useTeacherDashboard(
  options: UseTeacherDashboardOptions = {}
): UseQueryResult<TeacherDashboardData> {
  const mcp = useMCP();

  return useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: async () => {
      const [assignmentsResponse, classesResponse, studentsResponse] = await Promise.all([
        mcp.listAssignmentsForTeacher(),
        mcp.listClasses(),
        mcp.listOrgStudents(),
      ]);

      return {
        assignments: (assignmentsResponse as ListAssignmentsResponse).assignments ?? [],
        classes: (classesResponse as { classes: Class[] }).classes ?? [],
        students: (studentsResponse as { students: Student[] }).students ?? [],
      };
    },
    enabled: options.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
