import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMCP } from './useMCP';

export interface StudentAchievementsResponse {
  achievements: Array<{
    id: string;
    studentId: string;
    title: string;
    description: string;
    icon?: string;
    earnedAt: string;
  }>;
  total: number;
}

export function useStudentAchievements(
  studentId?: string
): UseQueryResult<StudentAchievementsResponse> {
  const mcp = useMCP();

  return useQuery({
    queryKey: ['student-achievements', studentId],
    queryFn: async (): Promise<StudentAchievementsResponse> => {
      const result = await mcp.getStudentAchievements(studentId);
      return {
        achievements: (result.achievements ?? []) as StudentAchievementsResponse['achievements'],
        total: result.total ?? 0,
      };
    },
    enabled: !!studentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

