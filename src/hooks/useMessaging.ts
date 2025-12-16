/**
 * useMessaging Hook
 * 
 * Provides unified access to messaging operations through MCP
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMCP } from './useMCP';

export function useMessaging(opts?: { enabled?: boolean }) {
  const mcp = useMCP();
  const queryClient = useQueryClient();
  const enabled = opts?.enabled ?? true;
  
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => mcp.listConversations(),
    staleTime: 30_000, // 30 seconds
    enabled,
  });
  
  const sendMessage = useMutation({
    mutationFn: (params: { recipientId: string; content: string }) =>
      mcp.sendMessage(params.recipientId, params.content),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', vars.recipientId] });
    },
  });
  
  const useMessages = (conversationWith: string) =>
    useQuery({
      queryKey: ['messages', conversationWith],
      queryFn: () => mcp.listMessages(conversationWith),
      enabled: enabled && !!conversationWith,
      staleTime: 10_000, // 10 seconds
    });
  
  return { conversations, sendMessage, useMessages };
}

