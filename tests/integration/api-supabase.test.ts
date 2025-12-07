/**
 * Integration Tests: Supabase API Calls
 * Tests API integration with mocked Supabase client
 * 
 * NOTE: This test file directly accesses Supabase for testing purposes.
 * In production code, use MCP hooks instead.
 */

/* eslint-disable ignite-zero/no-direct-supabase-ui */
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
jest.mock('@/integrations/supabase/client', () => {
  const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };

  return {
    supabase: {
      channel: jest.fn(() => mockChannel),
      removeChannel: jest.fn(),
      functions: {
        invoke: jest.fn(),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      })),
    },
  };
});

describe('Supabase Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Realtime Subscriptions', () => {
    it('creates channel for job events', () => {
      const channel = supabase.channel('job_events:test-job');
      
      expect(supabase.channel).toHaveBeenCalledWith('job_events:test-job');
      expect(channel).toBeDefined();
    });

    it('subscribes to postgres_changes events', () => {
      const channel = supabase.channel('test-channel');
      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_events',
        filter: 'job_id=eq.test-123',
      }, () => {}).subscribe();

      expect(channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'INSERT',
          table: 'job_events',
        }),
        expect.any(Function)
      );
      expect(channel.subscribe).toHaveBeenCalled();
    });

    it('removes channel on cleanup', () => {
      const channel = supabase.channel('test-channel');
      supabase.removeChannel(channel);

      expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
  });

  describe('Edge Function Calls', () => {
    it('invokes edge function with correct parameters', async () => {
      const mockInvoke = supabase.functions.invoke as jest.Mock;
      mockInvoke.mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const result = await supabase.functions.invoke('job-status', {
        body: { jobId: 'test-123' },
      });

      expect(mockInvoke).toHaveBeenCalledWith('job-status', {
        body: { jobId: 'test-123' },
      });
      expect(result.data).toEqual({ success: true });
    });

    it('handles edge function errors', async () => {
      const mockInvoke = supabase.functions.invoke as jest.Mock;
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Function failed', status: 500 },
      });

      const result = await supabase.functions.invoke('test-function', {});

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Function failed');
    });
  });

  describe('Database Queries', () => {
    it('queries table with filters', () => {
      const mockFrom = supabase.from as jest.Mock;
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({
        data: { id: '123', name: 'Test' },
        error: null,
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      });

      const query = supabase.from('courses')
        .select('*')
        .eq('id', 'test-123')
        .single();

      expect(mockFrom).toHaveBeenCalledWith('courses');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('id', 'test-123');
      expect(mockSingle).toHaveBeenCalled();
    });

    it('handles query errors', async () => {
      const mockFrom = supabase.from as jest.Mock;
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        single: mockSingle,
      });

      const result = await supabase.from('courses')
        .select('*')
        .single();

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Not found');
    });
  });
});

