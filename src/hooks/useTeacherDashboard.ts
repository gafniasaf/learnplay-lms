import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMockData } from '@/lib/api';
import { listAssignments, type Assignment, type ListAssignmentsResponse } from '@/lib/api/assignments';
import { listClasses, listOrgStudents, type Class, type Student } from '@/lib/api/classes';

export interface TeacherDashboardData {
  assignments: Assignment[];
  classes: Class[];
  students: Student[];
}

export interface UseTeacherDashboardOptions {
  enabled?: boolean;
}

async function fetchTeacherDashboard(): Promise<TeacherDashboardData> {
  const [assignmentsResponse, classesResponse, studentsResponse] = await Promise.all([
    listAssignments(),
    listClasses(),
    listOrgStudents(),
  ]);

  return {
    assignments: (assignmentsResponse as ListAssignmentsResponse).assignments ?? [],
    classes: classesResponse.classes ?? [],
    students: studentsResponse.students ?? [],
  };
}

export function useTeacherDashboard(
  options: UseTeacherDashboardOptions = {}
): UseQueryResult<TeacherDashboardData> {
  const mockMode = useMockData();
  const queryEnabled = options.enabled ?? !mockMode;

  return useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: fetchTeacherDashboard,
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
