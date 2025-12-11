/**
 * useParentData Hook
 * 
 * Provides unified access to parent data through MCP
 * Wraps useMCP for parent-specific operations
 */

import { useQuery } from '@tanstack/react-query';
import { useMCP } from './useMCP';
import { useAuth } from './useAuth';

export function useParentData() {
  const mcp = useMCP();
  const { user } = useAuth();
  
  const dashboard = useQuery({
    queryKey: ['parent-dashboard', user?.id],
    queryFn: () => {
      if (!user?.id) {
        throw new Error('User not authenticated - parentId required');
      }
      return mcp.getParentDashboard(user.id);
    },
    staleTime: 60_000,
    enabled: !!user?.id, // Don't fetch until we have a user ID
  });
  
  const children = useQuery({
    queryKey: ['parent-children', user?.id],
    queryFn: () => {
      if (!user?.id) {
        throw new Error('User not authenticated - parentId required');
      }
      return mcp.getParentChildren(user.id);
    },
    staleTime: 60_000,
    enabled: !!user?.id, // Don't fetch until we have a user ID
  });
  
  const useChildData = (childId: string) => ({
    goals: useQuery({
      queryKey: ['parent-goals', childId],
      queryFn: () => mcp.getParentGoals(childId),
      enabled: !!childId,
      staleTime: 60_000,
    }),
    subjects: useQuery({
      queryKey: ['parent-subjects', childId],
      queryFn: () => mcp.getParentSubjects(childId),
      enabled: !!childId,
      staleTime: 60_000,
    }),
    timeline: useQuery({
      queryKey: ['parent-timeline', childId],
      queryFn: () => mcp.getParentTimeline(childId),
      enabled: !!childId,
      staleTime: 60_000,
    }),
    topics: useQuery({
      queryKey: ['parent-topics', childId],
      queryFn: () => mcp.getParentTopics(childId),
      enabled: !!childId,
      staleTime: 60_000,
    }),
  });
  
  return { dashboard, children, useChildData };
}

