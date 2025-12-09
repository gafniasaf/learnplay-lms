/**
 * useStudentData Hook
 * 
 * Provides unified access to student data through MCP
 * Wraps useMCP for student-specific operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMCP } from './useMCP';

export function useStudentData(studentId?: string) {
  const mcp = useMCP();
  const queryClient = useQueryClient();
  
  const goals = useQuery({
    queryKey: ['student-goals', studentId],
    queryFn: () => mcp.getStudentGoals({ studentId }),
    enabled: !!studentId,
    staleTime: 60_000,
  });
  
  const timeline = useQuery({
    queryKey: ['student-timeline', studentId],
    queryFn: () => mcp.getStudentTimeline({ studentId }),
    enabled: !!studentId,
    staleTime: 60_000,
  });
  
  const achievements = useQuery({
    queryKey: ['student-achievements', studentId],
    queryFn: () => mcp.getStudentAchievements(studentId),
    enabled: !!studentId,
    staleTime: 60_000,
  });

  const updateGoal = useMutation({
    mutationFn: ({ goalId, updates }: { goalId: string; updates: { progress_minutes?: number; status?: string; teacher_note?: string } }) =>
      mcp.updateStudentGoal(goalId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-goals'] });
    },
  });
  
  return { 
    goals, 
    timeline, 
    achievements,
    updateGoal,
  };
}
