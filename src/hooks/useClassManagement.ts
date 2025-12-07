/**
 * useClassManagement Hook
 * 
 * Provides unified access to class management operations through MCP
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMCP } from './useMCP';

export function useClassManagement() {
  const mcp = useMCP();
  const queryClient = useQueryClient();
  
  const classes = useQuery({
    queryKey: ['classes'],
    queryFn: () => mcp.listClasses(),
    staleTime: 60_000,
  });
  
  const createClass = useMutation({
    mutationFn: (params: { name: string; description?: string }) =>
      mcp.createClass(params.name, params.description),
    onSuccess: () => {
      queryClient.invalidateQueries(['classes']);
    },
  });
  
  const addMember = useMutation({
    mutationFn: (params: { classId: string; studentEmail: string }) =>
      mcp.addClassMember(params.classId, params.studentEmail),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['classes']);
      queryClient.invalidateQueries(['class-roster', vars.classId]);
    },
  });
  
  const removeMember = useMutation({
    mutationFn: (params: { classId: string; studentId: string }) =>
      mcp.removeClassMember(params.classId, params.studentId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['classes']);
      queryClient.invalidateQueries(['class-roster', vars.classId]);
    },
  });
  
  const generateCode = useMutation({
    mutationFn: (params: { classId: string; refreshCode?: boolean }) =>
      mcp.generateClassCode(params.classId, params.refreshCode),
    onSuccess: () => {
      queryClient.invalidateQueries(['classes']);
    },
  });
  
  const joinClass = useMutation({
    mutationFn: (code: string) => mcp.joinClass(code),
    onSuccess: () => {
      queryClient.invalidateQueries(['classes']);
    },
  });
  
  const createChildCode = useMutation({
    mutationFn: (studentId: string) => mcp.createChildCode(studentId),
  });
  
  const linkChild = useMutation({
    mutationFn: (code: string) => mcp.linkChild(code),
    onSuccess: () => {
      queryClient.invalidateQueries(['parent-children']);
    },
  });
  
  return {
    classes,
    createClass,
    addMember,
    removeMember,
    generateCode,
    joinClass,
    createChildCode,
    linkChild,
  };
}

