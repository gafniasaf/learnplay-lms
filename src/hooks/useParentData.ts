/**
 * useParentData Hook
 * 
 * Provides unified access to parent data through MCP
 * Wraps useMCP for parent-specific operations
 */

import { useQuery } from '@tanstack/react-query';
import { useMCP } from './useMCP';

export function useParentData() {
  const mcp = useMCP();
  
  const dashboard = useQuery({
    queryKey: ['parent-dashboard'],
    queryFn: () => mcp.getParentDashboard(),
    staleTime: 60_000,
  });
  
  const children = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => mcp.getParentChildren(),
    staleTime: 60_000,
  });
  
  const getChildData = (childId: string) => ({
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
  
  return { dashboard, children, getChildData };
}

